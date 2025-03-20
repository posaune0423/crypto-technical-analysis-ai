import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import * as schema from "./schema";

// データベースファイルのパスを指定
const dbPath = path.resolve(process.cwd(), "sqlite.db");

// SQLiteデータベースとの接続を作成
const sqlite = new Database(dbPath);

// Drizzle ORMのインスタンスを作成
export const db = drizzle(sqlite, { schema });

// データベース接続をエクスポート
export default db;
