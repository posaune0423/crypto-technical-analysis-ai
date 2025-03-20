import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db";
import { tradeSignals } from "../db/schema";

export interface TradeSignal {
  id?: number;
  symbol: string;
  direction: string; // "BUY" or "SELL"
  price: number;
  strategy: string;
  strength?: number;
  timestamp?: string;
  isExecuted?: number;
}

// シグナルの作成
export async function createSignal(signal: TradeSignal) {
  return await db
    .insert(tradeSignals)
    .values({
      ...signal,
      timestamp: signal.timestamp || new Date().toISOString(),
      isExecuted: signal.isExecuted || 0,
    })
    .returning();
}

// シグナルの取得（IDによる）
export async function getSignalById(id: number) {
  return await db.select().from(tradeSignals).where(eq(tradeSignals.id, id)).get();
}

// 未実行のシグナルを取得
export async function getPendingSignals() {
  return await db.select().from(tradeSignals).where(eq(tradeSignals.isExecuted, 0)).all();
}

// 特定のシンボルの最新シグナルを取得
export async function getLatestSignalBySymbol(symbol: string) {
  const signals = await db
    .select()
    .from(tradeSignals)
    .where(eq(tradeSignals.symbol, symbol))
    .orderBy(desc(tradeSignals.timestamp))
    .limit(1)
    .all();

  return signals.length > 0 ? signals[0] : null;
}

// シグナルを実行済みにマーク
export async function markSignalAsExecuted(id: number) {
  return await db.update(tradeSignals).set({ isExecuted: 1 }).where(eq(tradeSignals.id, id)).returning();
}

// 特定の期間のシグナルを取得
export async function getSignalsByDateRange(startDate: Date, endDate: Date) {
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  return await db
    .select()
    .from(tradeSignals)
    .where(and(gte(tradeSignals.timestamp, start), lte(tradeSignals.timestamp, end)))
    .orderBy(desc(tradeSignals.timestamp))
    .all();
}

// 特定のシンボルと戦略のシグナルを取得
export async function getSignalsBySymbolAndStrategy(symbol: string, strategy: string) {
  return await db
    .select()
    .from(tradeSignals)
    .where(and(eq(tradeSignals.symbol, symbol), eq(tradeSignals.strategy, strategy)))
    .orderBy(desc(tradeSignals.timestamp))
    .all();
}
