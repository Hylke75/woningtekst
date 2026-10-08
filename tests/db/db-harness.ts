import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

/**
 * Testharnas voor database-/RLS-tests. Maakt een verse database aan, laadt de
 * Supabase-shim en alle migraties, en biedt helpers om queries uit te voeren
 * als een specifieke ingelogde gebruiker (rol "authenticated" + JWT-claims),
 * precies zoals PostgREST dat doet.
 */

const ROOT = path.resolve(__dirname, "../..");
export const SERVER_SECRET = "test-server-secret-" + "x".repeat(40);

export function adminUrl(db = "postgres") {
  // Lokaal: PostgreSQL via unix-socket; in CI via TEST_DATABASE_URL (service container).
  const base = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:54329/postgres?host=/tmp";
  const url = new URL(base.replace("postgresql://", "http://"));
  url.pathname = "/" + db;
  return url.toString().replace("http://", "postgresql://");
}

export async function createTestDatabase(name: string) {
  const admin = new pg.Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();

  const client = new pg.Client({ connectionString: adminUrl(name) });
  await client.connect();
  await client.query(readFileSync(path.join(ROOT, "supabase/tests/supabase-shim.sql"), "utf8"));
  const dir = path.join(ROOT, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await client.query(readFileSync(path.join(dir, file), "utf8"));
  }
  const hash = createHash("sha256").update(SERVER_SECRET).digest("hex");
  await client.query(
    "insert into private.server_secrets (name, secret_hash) values ('server_rpc', $1)",
    [hash],
  );
  return client;
}

export type TestUser = { id: string; email: string };

export async function createUser(
  db: pg.Client,
  email: string,
  opts: { confirmed?: boolean; fullName?: string } = {},
): Promise<TestUser> {
  const id = randomUUID();
  await db.query(
    "insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3, $4)",
    [id, email, opts.confirmed === false ? null : new Date(), { full_name: opts.fullName ?? email }],
  );
  return { id, email };
}

/**
 * Voert een functie uit binnen een transactie als de gegeven gebruiker; rolt altijd terug tenzij commit=true.
 * `aal` bepaalt het authenticatieniveau in het JWT (standaard aal2).
 */
export async function asUser<T>(
  db: pg.Client,
  user: TestUser | null,
  fn: (ctx: QueryCtx) => Promise<T>,
  opts: { commit?: boolean; aal?: "aal1" | "aal2" } = {},
): Promise<T> {
  await db.query("begin");
  try {
    if (user) {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        // Standaard een volledig geverifieerde sessie (aal2); MFA-tests zetten aal1 expliciet.
        JSON.stringify({ sub: user.id, role: "authenticated", email: user.email, aal: opts.aal ?? "aal2" }),
      ]);
    } else {
      await db.query("set local role anon");
    }
    const q = (sql: string, params?: unknown[]) => db.query(sql, params as unknown[]);
    let sp = 0;
    const deny = async (sql: string, params?: unknown[]) => {
      const name = `sp_${++sp}`;
      await db.query(`savepoint ${name}`);
      try {
        await db.query(sql, params as unknown[]);
      } catch (err) {
        await db.query(`rollback to savepoint ${name}`);
        return (err as Error).message;
      }
      await db.query(`release savepoint ${name}`);
      throw new Error(`Verwachtte een geweigerde operatie, maar deze slaagde: ${sql}`);
    };
    const result = await fn({ q, deny });
    await db.query(opts.commit ? "commit" : "rollback");
    return result;
  } catch (err) {
    await db.query("rollback");
    throw err;
  }
}

export type QueryCtx = {
  q: (sql: string, params?: unknown[]) => Promise<pg.QueryResult>;
  /** Verwacht dat de query faalt (RLS, rechten of trigger); geeft de foutmelding terug. */
  deny: (sql: string, params?: unknown[]) => Promise<string>;
};
