#!/usr/bin/env node
/**
 * Lokale ontwikkel-/testomgeving inrichten tegen `supabase start`.
 * Gebruikt UITSLUITEND fictieve gegevens (@example.test). Nooit tegen productie draaien.
 *
 *   node scripts/local-setup.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import pg from "pg";

const status = JSON.parse(execSync("npx supabase status -o json", { stdio: ["ignore", "pipe", "ignore"] }).toString());
const API = status.API_URL;
if (!/127\.0\.0\.1|localhost/.test(API)) {
  console.error("Weigering: dit script is alleen voor een lokale Supabase-stack.");
  process.exit(1);
}

const SERVER_RPC_SECRET = "local-dev-secret-0123456789abcdef0123456789abcdef";
export const PASSWORD = "Testwachtwoord123";
export const USERS = {
  admin: "admin@example.test",
  makelaar: "makelaar@example.test",
  redacteur: "redacteur@example.test",
  adminB: "admin-b@example.test",
};

const db = new pg.Client({ connectionString: status.DB_URL });
await db.connect();

await db.query("delete from auth.users where email like '%@example.test'");
await db.query("delete from public.organizations");
await db.query("delete from private.server_secrets");
await db.query("delete from storage.objects where bucket_id = 'property-documents'").catch(() => {});

const orgA = (await db.query("select private.bootstrap_organization('Korff de Gidts (lokaal)', $1) id", [USERS.admin])).rows[0].id;
const orgB = (await db.query("select private.bootstrap_organization('Ander kantoor (test)', $1) id", [USERS.adminB])).rows[0].id;
await db.query("insert into public.invitations (organization_id, email, role) values ($1, $2, 'makelaar'), ($1, $3, 'redacteur')", [orgA, USERS.makelaar, USERS.redacteur]);
await db.query("insert into private.server_secrets (name, secret_hash) values ('server_rpc', $1)", [createHash("sha256").update(SERVER_RPC_SECRET).digest("hex")]);
// Ruimere AI-limieten voor de lokale testorganisaties (de mock is veel sneller dan Claude).
await db.query("update public.organization_settings set ai_requests_per_minute_per_user = 300, ai_daily_requests_per_user = 5000");
const guide = readFileSync("content/schrijfwijzer/v1.md", "utf8");
for (const org of [orgA, orgB]) {
  await db.query("insert into public.style_guides (organization_id, version, title, content, change_note, is_active) values ($1, 1, 'Schrijfwijzer Korff de Gidts', $2, 'Initiële versie', true)", [org, guide]);
}

for (const [role, email] of Object.entries(USERS)) {
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: status.SECRET_KEY, Authorization: `Bearer ${status.SECRET_KEY}` },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: `Test ${role}` } }),
  });
  if (!res.ok) throw new Error(`Aanmaken ${email} mislukt: ${res.status} ${await res.text()}`);
}
const members = (await db.query("select p.email, m.role from public.organization_memberships m join public.profiles p on p.id = m.user_id order by 1")).rows;
console.log("Lidmaatschappen:", members);
await db.end();

const env = [
  `NEXT_PUBLIC_SUPABASE_URL=${API}`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY}`,
  `SUPABASE_SECRET_KEY=${status.SECRET_KEY}`,
  `SERVER_RPC_SECRET=${SERVER_RPC_SECRET}`,
  `NEXT_PUBLIC_APP_URL=http://localhost:3000`,
  `AI_MOCK=true`,
  `ANTHROPIC_MODEL=claude-opus-5-5`,
  "",
].join("\n");
if (!existsSync(".env.local") || process.argv.includes("--schrijf-env")) {
  writeFileSync(".env.local", env, { mode: 0o600 });
  console.log(".env.local geschreven (lokale, niet-geheime sleutels).");
}
console.log("Klaar. Inloggen met bijv.", USERS.makelaar, "/", PASSWORD);
