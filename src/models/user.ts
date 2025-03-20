import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";

export interface User {
  id?: number;
  name: string;
  email: string;
}

// ユーザーの作成
export async function createUser(user: User) {
  return await db.insert(users).values(user).returning();
}

// ユーザーの取得（IDによる）
export async function getUserById(id: number) {
  return await db.select().from(users).where(eq(users.id, id)).get();
}

// ユーザーの取得（Eメールによる）
export async function getUserByEmail(email: string) {
  return await db.select().from(users).where(eq(users.email, email)).get();
}

// 全ユーザーの取得
export async function getAllUsers() {
  return await db.select().from(users).all();
}

// ユーザーの更新
export async function updateUser(id: number, user: Partial<User>) {
  return await db.update(users).set(user).where(eq(users.id, id)).returning();
}

// ユーザーの削除
export async function deleteUser(id: number) {
  return await db.delete(users).where(eq(users.id, id)).returning();
}
