import { defineConfig } from "drizzle-kit";

// Migrations run as the database owner, never as the app role.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_OWNER ?? "" },
});
