import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Proves the multi-user hedge is real: the app role cannot see or write
// another owner's rows, sees nothing with no user set, and cannot hard
// delete. Needs a migrated database with the app role enabled:
//   TEST_DATABASE_URL_OWNER=postgres://owner@.../amber
//   TEST_DATABASE_URL=postgres://amber_app:...@.../amber
const ownerUrl = process.env.TEST_DATABASE_URL_OWNER;
const appUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!ownerUrl || !appUrl)("row-level security", async () => {
  process.env.DATABASE_URL = appUrl;
  const { getDb, withUser, closeDb } = await import("@/db");
  const { media } = await import("@/db/schema");

  const ben = randomUUID();
  const other = randomUUID();
  const owner = new Client({ connectionString: ownerUrl });

  beforeAll(async () => {
    await owner.connect();
    for (const id of [ben, other]) {
      await owner.query(`insert into "user" (id, name, email) values ($1, 'test', $2)`, [id, `${id}@test.local`]);
    }
  });

  afterAll(async () => {
    await owner.query(`delete from media where owner_id in ($1, $2)`, [ben, other]);
    await owner.query(`delete from "user" where id in ($1, $2)`, [ben, other]);
    await owner.end();
    await closeDb();
  });

  const row = (ownerId: string) => ({ ownerId, kind: "photo" as const, source: "test", status: "uploaded" as const });

  it("connects as a role that cannot bypass RLS", async () => {
    const res = await getDb().execute(
      `select current_user as role, rolbypassrls, rolsuper from pg_roles where rolname = current_user`,
    );
    expect(res.rows[0]).toMatchObject({ role: "amber_app", rolbypassrls: false, rolsuper: false });
  });

  it("shows each owner only their own rows", async () => {
    await withUser(ben, (tx) => tx.insert(media).values(row(ben)));
    await withUser(other, (tx) => tx.insert(media).values(row(other)));

    const seenByBen = await withUser(ben, (tx) => tx.select().from(media));
    expect(seenByBen.length).toBeGreaterThan(0);
    expect(seenByBen.every((m) => m.ownerId === ben)).toBe(true);
  });

  it("shows nothing when no user is set, even with a bug that skips withUser", async () => {
    const rows = await getDb().select().from(media);
    expect(rows).toHaveLength(0);
  });

  it("refuses to write a row for someone else", async () => {
    await expect(withUser(ben, (tx) => tx.insert(media).values(row(other)))).rejects.toThrow();
  });

  it("cannot change another owner's rows", async () => {
    const updated = await withUser(ben, (tx) =>
      tx.update(media).set({ caption: "hijacked" }).where(eq(media.ownerId, other)).returning(),
    );
    expect(updated).toHaveLength(0);
  });

  it("cannot hard delete: deletes are soft", async () => {
    // 42501 is Postgres' "insufficient privilege".
    await expect(withUser(ben, (tx) => tx.delete(media).where(eq(media.ownerId, ben)))).rejects.toMatchObject({
      cause: { code: "42501" },
    });
  });

  it("does not leak the user setting to the next transaction on the same connection", async () => {
    await withUser(ben, (tx) => tx.select().from(media));
    const res = await getDb().execute(`select current_setting('app.user_id', true) as uid`);
    expect(res.rows[0].uid || null).toBeNull();
  });
});
