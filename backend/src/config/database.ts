import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema";

let db: ReturnType<typeof drizzle<typeof schema>>;
let sql: ReturnType<typeof postgres>;

export function getDb() {
  if (!db) {
    sql = postgres(process.env.DATABASE_URL!, { max: 20 });
    db = drizzle(sql, { schema });
  }
  return db;
}

export function getSql() {
  if (!sql) {
    sql = postgres(process.env.DATABASE_URL!, { max: 20 });
  }
  return sql;
}

export async function closeDb() {
  if (sql) {
    await sql.end();
  }
}
