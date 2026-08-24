import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL || "mysql://root:@127.0.0.1:3306/app_db";

const globalForDb = globalThis as typeof globalThis & {
  __vcheckerMysqlPool?: mysql.Pool;
};

export const pool =
  globalForDb.__vcheckerMysqlPool ?? mysql.createPool(databaseUrl);

if (process.env.NODE_ENV !== "production") {
  globalForDb.__vcheckerMysqlPool = pool;
}

export const db = drizzle(pool, { schema, mode: "default" });
export { schema };
