import {
  DEFAULT_ORDER_TYPE,
  DEFAULT_TRADE_SIZE_USD,
  STOP_LOSS_PERCENTAGE,
  TAKE_PROFIT_PERCENTAGE,
} from "../config/bybit";
import {
  calculateOrderQty,
  closePosition,
  getCurrentPrice,
  getPosition,
  placeLimitOrder,
  placeMarketOrder,
  sleep,
} from "../lib/bybitClient";
import * as OrderModel from "../models/order";
import * as SignalModel from "../models/tradeSignal";
import { Logger, LogLevel } from "../utils/logger";

// Loggerの初期化
const logger = new Logger({
  level: LogLevel.INFO,
  enableTimestamp: true,
  enableColors: true,
});

/**
 * 利確価格を計算
 * @param entryPrice エントリー価格
 * @param side 売買方向
 * @param percentage 利確の割合（%）
 * @returns 利確価格
 */
function calculateTakeProfitPrice(
  entryPrice: number,
  side: "Buy" | "Sell",
  percentage: number = TAKE_PROFIT_PERCENTAGE,
): number {
  if (side === "Buy") {
    // ロングポジションの場合、エントリー価格より高い
    return entryPrice * (1 + percentage / 100);
  } else {
    // ショートポジションの場合、エントリー価格より低い
    return entryPrice * (1 - percentage / 100);
  }
}

/**
 * 損切り価格を計算
 * @param entryPrice エントリー価格
 * @param side 売買方向
 * @param percentage 損切りの割合（%）
 * @returns 損切り価格
 */
function calculateStopLossPrice(
  entryPrice: number,
  side: "Buy" | "Sell",
  percentage: number = STOP_LOSS_PERCENTAGE,
): number {
  if (side === "Buy") {
    // ロングポジションの場合、エントリー価格より低い
    return entryPrice * (1 - percentage / 100);
  } else {
    // ショートポジションの場合、エントリー価格より高い
    return entryPrice * (1 + percentage / 100);
  }
}

/**
 * シグナルに基づいて注文を実行する
 * @param signal トレードシグナル
 */
export async function executeSignalOrder(signal: SignalModel.TradeSignal): Promise<void> {
  try {
    logger.info("Executor", `シグナルに基づいて注文を実行: ${signal.symbol} ${signal.direction} (${signal.strategy})`);

    // 現在のポジションを確認
    const position = await getPosition(signal.symbol);

    // 既存のポジションがある場合はクローズ
    if (position && position.size && Number(position.size) !== 0) {
      const closeSide = position.side === "Buy" ? "Sell" : "Buy";
      logger.info(
        "Executor",
        `既存の${position.side}ポジションをクローズします: ${signal.symbol} ${Math.abs(Number(position.size))}`,
      );

      await closePosition(signal.symbol, closeSide, Math.abs(Number(position.size)));
      logger.debug("Executor", `ポジションクローズ完了: ${signal.symbol}`);

      // APIレート制限回避のための遅延
      await sleep(1000);
    }

    // 現在の価格を取得
    const currentPrice = await getCurrentPrice(signal.symbol);
    logger.debug("Executor", `現在価格: ${signal.symbol} ${currentPrice}`);

    // 注文数量を計算
    const qty = await calculateOrderQty(signal.symbol, currentPrice, DEFAULT_TRADE_SIZE_USD);

    // 注文方向を設定
    const side: "Buy" | "Sell" = signal.direction === "BUY" ? "Buy" : "Sell";

    // 利確と損切りの価格を計算
    const takeProfitPrice = calculateTakeProfitPrice(currentPrice, side);
    const stopLossPrice = calculateStopLossPrice(currentPrice, side);

    logger.debug(
      "Executor",
      `取引詳細: ${signal.symbol} ${side} 数量=${qty} 価格=${currentPrice} TP=${takeProfitPrice} SL=${stopLossPrice}`,
    );

    let orderId: string;

    // 注文タイプに応じて注文を実行
    if (DEFAULT_ORDER_TYPE === "Market") {
      logger.debug("Executor", `成行注文を実行: ${signal.symbol} ${side}`);
      orderId = await placeMarketOrder(signal.symbol, side, qty, takeProfitPrice, stopLossPrice);
    } else {
      // Limitの場合は少し有利な価格で注文
      const limitPrice =
        side === "Buy"
          ? currentPrice * 0.999 // 買いの場合は現在価格より0.1%低く
          : currentPrice * 1.001; // 売りの場合は現在価格より0.1%高く

      logger.debug("Executor", `指値注文を実行: ${signal.symbol} ${side} 指値=${limitPrice}`);
      orderId = await placeLimitOrder(signal.symbol, side, limitPrice, qty, takeProfitPrice, stopLossPrice);
    }

    // IDを数値に変換
    const signalId = typeof signal.id === "string" ? parseInt(signal.id) : signal.id;

    // 注文情報をDBに記録
    await OrderModel.createOrder({
      signalId: signalId,
      symbol: signal.symbol,
      side: side,
      orderType: DEFAULT_ORDER_TYPE,
      price: currentPrice,
      qty: qty,
      orderId: orderId,
      orderStatus: "NEW",
    });

    // シグナルを実行済みとしてマーク
    await SignalModel.markSignalAsExecuted(signalId);

    logger.info("Executor", `シグナル実行完了: ${signal.symbol} ${side} ${qty}@${currentPrice} (注文ID: ${orderId})`);
  } catch (error) {
    logger.error(
      "Executor",
      `シグナル実行エラー: ${signal.symbol} ${signal.direction} - ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

/**
 * 未実行のシグナルをすべて処理する
 * @returns 処理されたシグナルの配列
 */
export async function processAllPendingSignals(): Promise<SignalModel.TradeSignal[]> {
  try {
    const pendingSignals = await SignalModel.getPendingSignals();
    const processedSignals: SignalModel.TradeSignal[] = [];

    if (pendingSignals.length > 0) {
      logger.info("Executor", `未処理シグナル: ${pendingSignals.length}件`);
    } else {
      logger.debug("Executor", "未処理シグナルはありません");
      return processedSignals;
    }

    for (const signal of pendingSignals) {
      try {
        const tradeSignal = signal as unknown as SignalModel.TradeSignal;
        logger.debug(
          "Executor",
          `シグナル処理中: ${tradeSignal.symbol} ${tradeSignal.direction} (ID: ${tradeSignal.id})`,
        );

        await executeSignalOrder(tradeSignal);
        processedSignals.push(tradeSignal);

        // APIレート制限回避のための遅延
        await sleep(2000);
      } catch (error) {
        logger.error(
          "Executor",
          `シグナル処理エラー (ID: ${signal.id}) - ${error instanceof Error ? error.message : String(error)}`,
        );
        // エラーが発生しても次のシグナルを処理
        continue;
      }
    }

    return processedSignals;
  } catch (error) {
    logger.error("Executor", `未処理シグナル一括処理エラー: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
