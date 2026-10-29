// Turns on login for the restricted app role and sets its password.
// Run once per database (and per Neon branch) as the owner:
//   DATABASE_URL_OWNER=... APP_DB_PASSWORD=... pnpm db:app-role
import { Client } from "pg";

const ownerUrl = process.env.DATABASE_URL_OWNER;
const password = process.env.APP_DB_PASSWORD;
if (!ownerUrl || !password) {
  console.error("Set DATABASE_URL_OWNER and APP_DB_PASSWORD.");
  process.exit(1);
}

const client = new Client({ connectionString: ownerUrl });
await client.connect();
const escaped = password.replaceAll("'", "''");
await client.query(`ALTER ROLE amber_app WITH LOGIN PASSWORD '${escaped}'`);
const { rows } = await client.query(
  "select rolbypassrls, rolsuper from pg_roles where rolname = 'amber_app'",
);
await client.end();
if (rows[0]?.rolbypassrls || rows[0]?.rolsuper) {
  console.error("amber_app can bypass RLS. Fix the role before using it.");
  process.exit(1);
}
const url = new URL(ownerUrl);
url.username = "amber_app";
url.password = password;
console.log("amber_app can log in. Use this as DATABASE_URL:\n" + url.toString());
