import { TRADE_SYMBOLS } from "../config/bybit";
import { getCurrentPrice } from "../lib/bybitClient";
import { createSignal } from "../models/tradeSignal";
import { SignalStrategy } from "../types";

/**
 * ランダムな方向（買い/売り）を生成
 * @returns "BUY" または "SELL"
 */
function getRandomDirection(): "BUY" | "SELL" {
  return Math.random() > 0.5 ? "BUY" : "SELL";
}

/**
 * ランダムなシンボルを取得
 * @returns シンボル名（例: "BTCUSDT"）
 */
function getRandomSymbol(): string {
  const index = Math.floor(Math.random() * TRADE_SYMBOLS.length);
  return TRADE_SYMBOLS[index];
}

/**
 * ランダムな戦略名を生成
 * @returns 戦略名
 */
function getRandomStrategy(): SignalStrategy {
  const strategies: SignalStrategy[] = [
    "TREND_FOLLOWING",
    "RSI_OVERSOLD",
    "RSI_OVERBOUGHT",
    "MACD_BULLISH",
    "MACD_BEARISH",
    "EMA_CROSSOVER",
    "BREAKOUT",
  ];

  const index = Math.floor(Math.random() * strategies.length);
  return strategies[index];
}

/**
 * 0〜1のランダムな強度値を生成
 * @returns 強度値 (0.0-1.0)
 */
function getRandomStrength(): number {
  return Number((0.5 + Math.random() * 0.5).toFixed(2));
}

/**
 * テスト用のランダムなシグナルを生成
 */
export async function generateRandomSignal() {
  try {
    const symbol = getRandomSymbol();
    const direction = getRandomDirection();
    const price = await getCurrentPrice(symbol);
    const strategy = getRandomStrategy();
    const strength = getRandomStrength();

    const signal = await createSignal({
      id: `signal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      symbol,
      direction,
      price,
      strategy,
      strength,
      positionSizeUsd: 100,
      leverage: 5,
      timestamp: new Date().toISOString(),
      executed: false,
    });

    console.log(`test signal generated: ${symbol} ${direction} @ ${price} (${strategy})`);
    return signal;
  } catch (error) {
    console.error("signal generation error:", error);
    throw error;
  }
}

/**
 * 特定のシンボルと方向で強制的にシグナルを生成
 */
export async function generateForcedSignal(
  symbol: string,
  direction: "BUY" | "SELL",
  strategy: SignalStrategy = "MANUAL",
) {
  try {
    const price = await getCurrentPrice(symbol);

    const signal = await createSignal({
      id: `forced-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      symbol,
      direction,
      price,
      strategy,
      strength: 1.0, // 確信度100%
      positionSizeUsd: 100,
      leverage: 10,
      timestamp: new Date().toISOString(),
      executed: false,
    });

    console.log(`forced signal generated: ${symbol} ${direction} @ ${price} (${strategy})`);
    return signal;
  } catch (error) {
    console.error("forced signal generation error:", error);
    throw error;
  }
}
