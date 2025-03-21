import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { orders } from "../db/schema";

export interface Order {
  id?: number;
  signalId: number;
  symbol: string;
  side: "Buy" | "Sell";
  orderType: string; // "Market", "Limit", etc.
  price?: number;
  qty: number;
  orderId?: string; // Bybit APIから返されるオーダーID
  orderStatus?: string;
  timestamp?: string;
  profitLoss?: number;
  isClosed?: number; // 0: オープン, 1: クローズ
}

// 注文を作成
export async function createOrder(order: Order) {
  return await db
    .insert(orders)
    .values({
      ...order,
      timestamp: order.timestamp || new Date().toISOString(),
      isClosed: order.isClosed || 0,
    })
    .returning();
}

// 注文詳細の取得（IDによる）
export async function getOrderById(id: number) {
  return await db.select().from(orders).where(eq(orders.id, id)).get();
}

// シグナルIDによる注文取得
export async function getOrderBySignalId(signalId: number) {
  return await db.select().from(orders).where(eq(orders.signalId, signalId)).get();
}

// 特定の注文IDによる注文取得
export async function getOrderByOrderId(orderId: string) {
  return await db.select().from(orders).where(eq(orders.orderId, orderId)).get();
}

// 未クローズ（オープン中）の注文を取得
export async function getOpenOrders() {
  return await db.select().from(orders).where(eq(orders.isClosed, 0)).all();
}

// シンボルごとのオープン注文を取得
export async function getOpenOrdersBySymbol(symbol: string) {
  return await db
    .select()
    .from(orders)
    .where(and(eq(orders.symbol, symbol), eq(orders.isClosed, 0)))
    .all();
}

// 注文ステータスを更新
export async function updateOrderStatus(id: number, status: string) {
  return await db.update(orders).set({ orderStatus: status }).where(eq(orders.id, id)).returning();
}

// 注文を閉じる（クローズ）
export async function closeOrder(id: number, profitLoss?: number) {
  return await db
    .update(orders)
    .set({
      isClosed: 1,
      profitLoss: profitLoss,
    })
    .where(eq(orders.id, id))
    .returning();
}

// 最近の注文を取得
export async function getRecentOrders(limit: number = 10) {
  return await db.select().from(orders).orderBy(desc(orders.timestamp)).limit(limit).all();
}
