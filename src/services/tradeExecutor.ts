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
    console.log(`Execute signal order: ${signal.symbol} ${signal.direction} (${signal.strategy})`);

    // 現在のポジションを確認
    const position = await getPosition(signal.symbol);

    // 既存のポジションがある場合はクローズ
    if (position && position.size && Number(position.size) !== 0) {
      const closeSide = position.side === "Buy" ? "Sell" : "Buy";
      await closePosition(signal.symbol, closeSide, Math.abs(Number(position.size)));

      // APIレート制限回避のための遅延
      await sleep(1000);
    }

    // 現在の価格を取得
    const currentPrice = await getCurrentPrice(signal.symbol);

    // 注文数量を計算
    const qty = await calculateOrderQty(signal.symbol, currentPrice, DEFAULT_TRADE_SIZE_USD);

    // 注文方向を設定
    const side: "Buy" | "Sell" = signal.direction === "BUY" ? "Buy" : "Sell";

    // 利確と損切りの価格を計算
    const takeProfitPrice = calculateTakeProfitPrice(currentPrice, side);
    const stopLossPrice = calculateStopLossPrice(currentPrice, side);

    let orderId: string;

    // 注文タイプに応じて注文を実行
    if (DEFAULT_ORDER_TYPE === "Market") {
      orderId = await placeMarketOrder(signal.symbol, side, qty, takeProfitPrice, stopLossPrice);
    } else {
      // Limitの場合は少し有利な価格で注文
      const limitPrice =
        side === "Buy"
          ? currentPrice * 0.999 // 買いの場合は現在価格より0.1%低く
          : currentPrice * 1.001; // 売りの場合は現在価格より0.1%高く

      orderId = await placeLimitOrder(signal.symbol, side, limitPrice, qty, takeProfitPrice, stopLossPrice);
    }

    // 注文情報をDBに記録
    await OrderModel.createOrder({
      signalId: signal.id!,
      symbol: signal.symbol,
      side: side,
      orderType: DEFAULT_ORDER_TYPE,
      price: currentPrice,
      qty: qty,
      orderId: orderId,
      orderStatus: "NEW",
    });

    // シグナルを実行済みとしてマーク
    await SignalModel.markSignalAsExecuted(signal.id!);

    console.log(`Signal executed: ${signal.symbol} ${side} ${qty}@${currentPrice} (ID: ${orderId})`);
  } catch (error) {
    console.error(`Signal execution error: ${signal.symbol} ${signal.direction}`, error);
    throw error;
  }
}

/**
 * 未実行のシグナルをすべて処理する
 */
export async function processAllPendingSignals(): Promise<void> {
  try {
    const pendingSignals = await SignalModel.getPendingSignals();

    console.log(`Pending signals: ${pendingSignals.length}件`);

    for (const signal of pendingSignals) {
      try {
        await executeSignalOrder(signal as SignalModel.TradeSignal);
        // APIレート制限回避のための遅延
        await sleep(2000);
      } catch (error) {
        console.error(`Signal processing error (ID: ${signal.id})`, error);
        // エラーが発生しても次のシグナルを処理
        continue;
      }
    }
  } catch (error) {
    console.error("Pending signal processing error", error);
    throw error;
  }
}
