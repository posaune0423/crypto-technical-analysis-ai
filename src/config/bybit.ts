import dotenv from "dotenv";

dotenv.config();

export const BYBIT_API_KEY = process.env.BYBIT_API_KEY || "";
export const BYBIT_API_SECRET = process.env.BYBIT_API_SECRET || "";
export const BYBIT_TESTNET = process.env.BYBIT_TESTNET === "true";

export const DEFAULT_TRADE_SIZE_USD = Number(process.env.DEFAULT_TRADE_SIZE_USD || "50"); // デフォルトの取引サイズ（USD）
export const MAX_LEVERAGE = Number(process.env.MAX_LEVERAGE || "5"); // 最大レバレッジ

// 注文設定
export const DEFAULT_ORDER_TYPE = process.env.DEFAULT_ORDER_TYPE || "Market"; // Market or Limit
export const TAKE_PROFIT_PERCENTAGE = Number(process.env.TAKE_PROFIT_PERCENTAGE || "3"); // 利確ポイント（%）
export const STOP_LOSS_PERCENTAGE = Number(process.env.STOP_LOSS_PERCENTAGE || "1.5"); // 損切りポイント（%）

// トレード対象のシンボル
export const TRADE_SYMBOLS = (process.env.TRADE_SYMBOLS || "BTCUSDT,ETHUSDT").split(",");
