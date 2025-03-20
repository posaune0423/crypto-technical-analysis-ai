import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// usersテーブルの定義
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: text("created_at").notNull().default(new Date().toISOString()),
  updatedAt: text("updated_at").notNull().default(new Date().toISOString()),
});

// トレードシグナルのテーブル定義
export const tradeSignals = sqliteTable("trade_signals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),
  direction: text("direction").notNull(), // BUY or SELL
  price: real("price").notNull(),
  strategy: text("strategy").notNull(),
  strength: real("strength"), // シグナルの強さ (0.0-1.0)
  timestamp: text("timestamp").notNull().default(new Date().toISOString()),
  isExecuted: integer("is_executed").notNull().default(0), // 0: 未執行, 1: 執行済み
});

// 注文履歴のテーブル定義
export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  signalId: integer("signal_id").notNull(), // 関連するシグナルのID
  symbol: text("symbol").notNull(),
  side: text("side").notNull(), // Buy or Sell
  orderType: text("order_type").notNull(), // Limit, Market, etc.
  price: real("price"),
  qty: real("qty").notNull(),
  orderId: text("order_id"), // Bybitから返される注文ID
  orderStatus: text("order_status"),
  timestamp: text("timestamp").notNull().default(new Date().toISOString()),
  profitLoss: real("profit_loss"), // 利益/損失
  isClosed: integer("is_closed").notNull().default(0), // 0: オープン, 1: クローズ
});
