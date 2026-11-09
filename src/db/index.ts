import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

let cached: { pool: Pool; db: Db } | undefined;

// The app always connects as the restricted `amber_app` role (see
// drizzle/0000_roles.sql). That role does not own the tables and cannot
// bypass row-level security, so every query on owner tables only sees rows
// whose owner_id matches the user set by withUser().
export function getDb(): Db {
  if (!cached) {
    // `next build` imports the auth routes, which build this client, but
    // never queries. pg connects lazily, so a build without database
    // settings (a first Vercel deploy, a fresh fork) still succeeds; at run
    // time a missing DATABASE_URL fails loudly as before.
    const building = process.env.NEXT_PHASE === "phase-production-build";
    const connectionString = building ? (process.env.DATABASE_URL ?? "postgres://build@localhost/build") : env.databaseUrl;
    const pool = new Pool({ connectionString, max: 5 });
    cached = { pool, db: drizzle(pool, { schema }) };
  }
  return cached.db;
}

export async function closeDb() {
  await cached?.pool.end();
  cached = undefined;
}

// Run `fn` in a transaction scoped to one user. `set_config(..., true)` is
// transaction-local, so the setting cannot leak to the next request that
// reuses the pooled connection.
export function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
