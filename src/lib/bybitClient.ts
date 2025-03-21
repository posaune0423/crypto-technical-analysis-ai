import { KlineIntervalV3, RestClientOptions, RestClientV5 } from "bybit-api";
import { BYBIT_API_KEY, BYBIT_API_SECRET, BYBIT_TESTNET, DEFAULT_TRADE_SIZE_USD, MAX_LEVERAGE } from "../config/bybit";

// Bybit APIクライアント設定
const clientOptions: RestClientOptions = {
  key: BYBIT_API_KEY,
  secret: BYBIT_API_SECRET,
  testnet: BYBIT_TESTNET,
  baseUrl: "https://api-demo.bybit.com",
};

// V5 APIクライアント
export const client = new RestClientV5(clientOptions);

// APIレート制限を回避するための遅延関数
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * シンボルが逆永久契約かどうかを判断する
 * @param symbol シンボル名
 * @returns 逆永久契約の場合はtrue
 */
export function isInverseSymbol(symbol: string): boolean {
  // USD建ての逆永久契約（BTCUSD, ETHUSD など）
  return symbol.endsWith("USD") && !symbol.endsWith("USDT") && !symbol.endsWith("USDC");
}

/**
 * シンボルに対応するカテゴリを取得する
 * @param symbol シンボル名
 * @returns カテゴリ
 */
export function getCategoryForSymbol(symbol: string): "linear" | "inverse" | "spot" {
  if (symbol.endsWith("USDT") || symbol.endsWith("USDC")) {
    return "linear"; // USDTまたはUSDC建ての永久契約
  } else if (isInverseSymbol(symbol)) {
    return "inverse"; // USD建ての逆永久契約
  } else {
    return "spot"; // 現物取引
  }
}

/**
 * シンボルの現在価格を取得する
 * @param symbol シンボル名
 * @returns 現在価格
 */
export async function getCurrentPrice(symbol: string): Promise<number> {
  const category = getCategoryForSymbol(symbol);

  try {
    let response;

    if (category === "linear" || category === "inverse") {
      response = await client.getTickers({
        category,
        symbol,
      });
    } else {
      response = await client.getTickers({
        category: "spot",
        symbol,
      });
    }

    if (response.retCode === 0 && response.result.list && response.result.list.length > 0) {
      const ticker = response.result.list[0];
      // 各カテゴリによって異なるプロパティ名に対応
      const price = ticker.lastPrice || ticker.last;
      return parseFloat(price);
    }
    throw new Error(`Failed to get ticker information: ${symbol}`);
  } catch (error) {
    console.error(`Price retrieval error: ${symbol}`, error);
    throw error;
  }
}

/**
 * 注文数量を計算する
 * @param symbol シンボル名
 * @param price 現在価格
 * @param usdAmount 注文金額（USD）
 * @returns 注文数量
 */
export async function calculateOrderQty(
  symbol: string,
  price: number,
  usdAmount: number = DEFAULT_TRADE_SIZE_USD,
): Promise<number> {
  const category = getCategoryForSymbol(symbol);

  try {
    const response = await client.getInstrumentsInfo({
      category,
      symbol,
    });

    if (response.retCode !== 0 || !response.result.list || response.result.list.length === 0) {
      throw new Error(`Symbol information not found: ${symbol}`);
    }

    const symbolData = response.result.list[0];
    // 型の問題を回避するためにany型にキャスト
    const lotSizeFilter = symbolData.lotSizeFilter as any;

    // カテゴリによって異なるフィルター構造に対応
    let qtyStep: number;
    let minOrderQty: number;
    let qtyPrecision: number = 8; // デフォルト精度

    if (category === "linear" || category === "inverse") {
      qtyStep = parseFloat(lotSizeFilter?.qtyStep || "0.001");
      minOrderQty = parseFloat(lotSizeFilter?.minOrderQty || "0.001");
      qtyPrecision = lotSizeFilter?.qtyStep ? Math.max(0, lotSizeFilter.qtyStep.split(".")[1]?.length || 0) : 3;
    } else {
      // spot
      qtyStep = parseFloat(lotSizeFilter?.basePrecision || "0.001");
      minOrderQty = parseFloat(lotSizeFilter?.minOrderQty || "0.001");
      qtyPrecision = parseInt(lotSizeFilter?.basePrecision || "3");
    }

    console.log(`Symbol: ${symbol}, Min Order Qty: ${minOrderQty}, Qty Step: ${qtyStep}`);

    // 数量計算
    let quantity;
    if (category === "linear") {
      // USDT建て: 数量 = USD金額 / 価格
      quantity = usdAmount / price;
      // 最小数量に調整
      quantity = Math.floor(quantity / qtyStep) * qtyStep;
    } else {
      // USD建て逆永久契約または現物
      quantity = category === "inverse" ? usdAmount : usdAmount / price;
      // 最小数量に調整
      quantity = Math.floor(quantity / qtyStep) * qtyStep;
    }

    // 最小注文量のチェック
    if (quantity < minOrderQty) {
      console.warn(`Calculated quantity ${quantity} is less than minimum order quantity ${minOrderQty} for ${symbol}`);
      // 最小注文量に調整
      quantity = minOrderQty;
      console.log(`Adjusted to minimum order quantity: ${quantity}`);
    }

    return parseFloat(quantity.toFixed(qtyPrecision));
  } catch (error) {
    console.error(`Quantity calculation error: ${symbol}`, error);
    throw error;
  }
}

/**
 * レバレッジを設定する
 * @param symbol シンボル名
 * @param leverage レバレッジ
 */
export async function setLeverage(symbol: string, leverage: number = MAX_LEVERAGE): Promise<void> {
  const category = getCategoryForSymbol(symbol);

  // 現物取引の場合はレバレッジ設定不要
  if (category === "spot") return;

  try {
    const response = await client.setLeverage({
      category,
      symbol,
      buyLeverage: leverage.toString(),
      sellLeverage: leverage.toString(),
    });

    if (response.retCode === 0) {
      console.log(`Leverage set: ${symbol} - ${leverage}x`);
    } else {
      console.warn(`Leverage setting warning: ${response.retMsg}`);
    }
  } catch (error) {
    console.error(`Leverage setting error: ${symbol}`, error);
    // エラーを無視して処理を続行（既に設定されている場合など）
  }
}

/**
 * 市場注文を出す
 * @param symbol シンボル名
 * @param side 売買方向 ("Buy" | "Sell")
 * @param qty 数量
 * @param takeProfitPrice 利確価格
 * @param stopLossPrice 損切り価格
 * @returns 注文ID
 */
export async function placeMarketOrder(
  symbol: string,
  side: "Buy" | "Sell",
  qty: number,
  takeProfitPrice?: number,
  stopLossPrice?: number,
): Promise<string> {
  const category = getCategoryForSymbol(symbol);

  try {
    // レバレッジを設定（現物以外）
    if (category !== "spot") {
      await setLeverage(symbol);
    }

    // 注文パラメータ
    const orderParams: any = {
      category,
      symbol,
      side,
      orderType: "Market",
      qty: qty.toString(),
      timeInForce: "GTC", // GoodTillCancel
    };

    // 現物取引以外の場合のみ
    if (category !== "spot") {
      orderParams.reduceOnly = false;
      orderParams.closeOnTrigger = false;
    }

    // 利確・損切り設定
    if (takeProfitPrice) {
      orderParams.takeProfit = takeProfitPrice.toString();
    }

    if (stopLossPrice) {
      orderParams.stopLoss = stopLossPrice.toString();
    }

    // 注文送信
    const response = await client.submitOrder(orderParams);

    if (response.retCode === 0) {
      console.log(`Order success: ${symbol} ${side} ${qty}`);
      return response.result.orderId;
    } else {
      throw new Error(`Order error: ${response.retMsg}`);
    }
  } catch (error) {
    console.error(`Order error: ${symbol} ${side}`, error);
    throw error;
  }
}

/**
 * 指値注文を出す
 * @param symbol シンボル名
 * @param side 売買方向 ("Buy" | "Sell")
 * @param price 注文価格
 * @param qty 数量
 * @param takeProfitPrice 利確価格
 * @param stopLossPrice 損切り価格
 * @returns 注文ID
 */
export async function placeLimitOrder(
  symbol: string,
  side: "Buy" | "Sell",
  price: number,
  qty: number,
  takeProfitPrice?: number,
  stopLossPrice?: number,
): Promise<string> {
  const category = getCategoryForSymbol(symbol);

  try {
    // レバレッジを設定（現物以外）
    if (category !== "spot") {
      await setLeverage(symbol);
    }

    // 注文パラメータ
    const orderParams: any = {
      category,
      symbol,
      side,
      orderType: "Limit",
      price: price.toString(),
      qty: qty.toString(),
      maxOrderQty: qty.toString(),
      maxPrice: price.toString(),
      timeInForce: "GTC", // GoodTillCancel
    };

    // 現物取引以外の場合のみ
    if (category !== "spot") {
      orderParams.reduceOnly = false;
      orderParams.closeOnTrigger = false;
    }

    // 利確・損切り設定
    if (takeProfitPrice) {
      orderParams.takeProfit = takeProfitPrice.toString();
    }

    if (stopLossPrice) {
      orderParams.stopLoss = stopLossPrice.toString();
    }

    // 注文送信
    const response = await client.submitOrder(orderParams);

    if (response.retCode === 0) {
      console.log(`Limit order success: ${symbol} ${side} ${qty} @ ${price}`);
      return response.result.orderId;
    } else {
      throw new Error(`Order error: ${response.retMsg}`);
    }
  } catch (error) {
    console.error(`Limit order error: ${symbol} ${side}`, error);
    throw error;
  }
}

/**
 * ポジションをクローズする
 * @param symbol シンボル名
 * @param side 現在のポジションの方向と逆方向 ("Buy" | "Sell")
 * @param qty 数量
 * @returns 注文ID
 */
export async function closePosition(symbol: string, side: "Buy" | "Sell", qty: number): Promise<string> {
  const category = getCategoryForSymbol(symbol);

  // 現物取引の場合は別途処理が必要（この実装では省略）
  if (category === "spot") {
    throw new Error("Spot trading position closure is not supported");
  }

  try {
    // 注文パラメータ
    const orderParams: any = {
      category,
      symbol,
      side,
      orderType: "Market",
      qty: qty.toString(),
      maxOrderQty: qty.toString(),
      timeInForce: "GTC", // GoodTillCancel
      reduceOnly: true, // ポジションクローズのみ
      closeOnTrigger: true,
    };

    // 注文送信
    const response = await client.submitOrder(orderParams);

    if (response.retCode === 0) {
      console.log(`Position closure success: ${symbol} ${side} ${qty}`);
      return response.result.orderId;
    } else {
      throw new Error(`Position closure error: ${response.retMsg}`);
    }
  } catch (error) {
    console.error(`Position closure error: ${symbol} ${side}`, error);
    throw error;
  }
}

/**
 * 注文情報を取得する
 * @param symbol シンボル名
 * @param orderId 注文ID
 * @returns 注文情報
 */
export async function getOrderInfo(symbol: string, orderId: string): Promise<any> {
  const category = getCategoryForSymbol(symbol);

  try {
    // V5 APIではgetOrderHistoryを使用して注文情報を取得
    const response = await client.getHistoricOrders({
      category,
      symbol,
      orderId,
    });

    if (response.retCode === 0 && response.result.list && response.result.list.length > 0) {
      return response.result.list[0];
    } else {
      throw new Error(`Failed to get order information: ${orderId}`);
    }
  } catch (error) {
    console.error(`Order information retrieval error: ${symbol} ${orderId}`, error);
    throw error;
  }
}

/**
 * ポジション情報を取得する
 * @param symbol シンボル名
 * @returns ポジション情報
 */
export async function getPosition(symbol: string): Promise<any> {
  const category = getCategoryForSymbol(symbol);

  // 現物取引の場合は別途残高取得が必要（この実装では省略）
  if (category === "spot") {
    throw new Error("Spot trading position information retrieval is not supported");
  }

  try {
    const response = await client.getPositionInfo({
      category,
      symbol,
    });

    if (response.retCode === 0 && response.result.list && response.result.list.length > 0) {
      return response.result.list[0];
    } else {
      console.log(`Position not found: ${symbol}`);
      return null;
    }
  } catch (error) {
    console.error(`Position information retrieval error: ${symbol}`, error);
    throw error;
  }
}

/**
 * 複数シンボルのポジション情報を取得する
 * @param category 取引カテゴリ
 * @returns ポジション情報の配列
 */
export async function getAllPositions(category: "linear" | "inverse"): Promise<any[]> {
  try {
    const response = await client.getPositionInfo({
      category,
    });

    if (response.retCode === 0 && response.result.list) {
      return response.result.list;
    } else {
      return [];
    }
  } catch (error) {
    console.error(`All position information retrieval error:`, error);
    throw error;
  }
}

/**
 * 口座残高を取得する
 * @param coin コイン名（例: USDT, BTC）
 * @returns 口座残高情報
 */
export async function getWalletBalance(coin?: string): Promise<any> {
  try {
    const response = await client.getWalletBalance({
      accountType: "UNIFIED", // 統合口座
      coin,
    });

    if (response.retCode === 0) {
      return response.result;
    } else {
      throw new Error(`Balance retrieval error: ${response.retMsg}`);
    }
  } catch (error) {
    console.error(`Balance retrieval error:`, error);
    throw error;
  }
}

/**
 * ティッカー情報を取得する
 * @param category 取引カテゴリ
 * @param symbol シンボル名
 * @returns ティッカー情報
 */
export async function getTicker(category: "linear" | "inverse" | "spot", symbol: string): Promise<any> {
  try {
    let response;

    if (category === "linear" || category === "inverse") {
      response = await client.getTickers({
        category,
        symbol,
      });
    } else {
      // スポット取引の場合
      response = await client.getTickers({
        category: "spot",
        symbol,
      });
    }

    if (response.retCode === 0 && response.result.list && response.result.list.length > 0) {
      return response.result.list[0];
    } else {
      throw new Error(`Failed to get ticker information: ${symbol}`);
    }
  } catch (error) {
    console.error(`Ticker retrieval error: ${symbol}`, error);
    throw error;
  }
}

/**
 * K線データを取得する
 * @param category 取引カテゴリ
 * @param symbol シンボル名
 * @param interval 時間枠（例: "1", "5", "15", "30", "60", "240", "D", "W", "M"）
 * @param limit 取得件数（最大1000）
 * @returns K線データの配列
 */
export async function getKlines(
  category: "linear" | "inverse" | "spot",
  symbol: string,
  interval: KlineIntervalV3,
  limit: number = 200,
): Promise<any[]> {
  try {
    const response = await client.getKline({
      category,
      symbol,
      interval,
      limit,
    });

    if (response.retCode === 0 && response.result.list) {
      return response.result.list;
    } else {
      throw new Error(`Failed to get K-line data: ${symbol}`);
    }
  } catch (error) {
    console.error(`K-line data retrieval error: ${symbol}`, error);
    throw error;
  }
}
