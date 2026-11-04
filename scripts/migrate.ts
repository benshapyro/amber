// Applies drizzle/ migrations as the database owner.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const url = process.env.DATABASE_URL_OWNER;
if (!url) {
  console.error("Set DATABASE_URL_OWNER.");
  process.exit(1);
}
const pool = new Pool({ connectionString: url });
await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
await pool.end();
console.log("Migrations applied.");
