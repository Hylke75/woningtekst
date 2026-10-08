import { existsSync, readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { freshTotp, resetMfaFactors } from "../helpers/mfa";

export const PASSWORD = "Testwachtwoord123";
export const USERS = {
  admin: "admin@example.test",
  makelaar: "makelaar@example.test",
  redacteur: "redacteur@example.test",
  adminB: "admin-b@example.test",
} as const;

const ADMINS: string[] = [USERS.admin, USERS.adminB];

/** Lokale Supabase-configuratie uit .env.local (geschreven door scripts/local-setup.mjs). */
function localEnv(name: string): string {
  if (process.env[name]) return process.env[name]!;
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && m[1] === name) return m[2];
    }
  }
  throw new Error(`${name} ontbreekt (draai node scripts/local-setup.mjs --schrijf-env)`);
}

/** TOTP-geheimen van in deze testrun ingeschreven admins. */
const mfaSecrets = new Map<string, string>();

export async function resetMfa(email: string) {
  mfaSecrets.delete(email);
  await resetMfaFactors(localEnv("NEXT_PUBLIC_SUPABASE_URL"), localEnv("SUPABASE_SECRET_KEY"), email);
}

/**
 * Inloggen via de interface. Administrators moeten twee-stapsverificatie hebben
 * (er is bewust géén uitschakelaar in de app): bij de eerste login van een admin
 * wordt via /beveiliging een TOTP-factor ingeschreven; daarna gaat elke login via
 * /inloggen/verificatie met een code uit tests/helpers/totp.ts.
 */
export async function login(page: Page, email: string, opts: { skipMfaSetup?: boolean } = {}): Promise<void> {
  await page.goto("/inloggen");
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByLabel("Wachtwoord").fill(PASSWORD);
  await page.getByRole("button", { name: "Inloggen" }).click();
  await page.waitForURL(/\/(dashboard|inloggen\/verificatie)/);

  if (page.url().includes("/inloggen/verificatie")) {
    const secret = mfaSecrets.get(email);
    if (!secret) {
      // Factor uit een eerdere run zonder bekend geheim: opruimen en opnieuw beginnen.
      await resetMfa(email);
      await page.context().clearCookies();
      return login(page, email, opts);
    }
    await page.getByLabel("Verificatiecode").fill(await freshTotp(secret));
    await page.getByRole("button", { name: "Bevestigen" }).click();
    await page.waitForURL("**/dashboard");
    return;
  }

  // Admin rechtstreeks op het dashboard = nog geen factor.
  if (ADMINS.includes(email) && !opts.skipMfaSetup) await enrollMfaViaUi(page, email);
}

/** Schrijft via /beveiliging een authenticator-app in voor de ingelogde gebruiker. */
export async function enrollMfaViaUi(page: Page, email: string) {
  await page.goto("/beveiliging");
  await page.getByRole("button", { name: "Twee-stapsverificatie instellen" }).click();
  // QR-code is een data-URL (CSP img-src data:) en moet daadwerkelijk renderen.
  const qr = page.getByAltText("QR-code voor uw authenticator-app");
  await expect(qr).toBeVisible();
  expect(await qr.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const secret = ((await page.getByTestId("mfa-secret").textContent()) ?? "").replace(/\s/g, "");
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
  await page.getByLabel("Vul de 6-cijferige code uit de app in").fill(await freshTotp(secret));
  await page.getByRole("button", { name: "Bevestigen" }).click();
  await expect(page.getByText("Twee-stapsverificatie is ingesteld.")).toBeVisible();
  mfaSecrets.set(email, secret);
  await page.goto("/dashboard");
}

export function knownMfaSecret(email: string) {
  return mfaSecrets.get(email);
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: /Test / }).click();
  await page.getByRole("menuitem", { name: "Uitloggen" }).click();
  await page.waitForURL("**/inloggen**");
}

/** Maakt via de interface een woning aan met basisgegevens en wacht op autosave. */
export async function createProperty(page: Page, data: { street: string; number: string; city: string; type?: string; extra?: Record<string, string> }) {
  await page.goto("/woningen/nieuw");
  await page.getByRole("button", { name: "Start handmatig" }).click();
  await page.waitForURL("**/gegevens");
  await page.getByLabel("Straatnaam").fill(data.street);
  await page.getByLabel("Huisnummer").fill(data.number);
  await page.getByLabel("Plaats").fill(data.city);
  await page.getByRole("combobox", { name: "Woningtype" }).click();
  await page.getByRole("option", { name: data.type ?? "Herenhuis", exact: true }).click();
  for (const [label, value] of Object.entries(data.extra ?? {})) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  await waitForSaved(page);
  const id = page.url().match(/woningen\/([0-9a-f-]{36})/)![1];
  return id;
}

/** Wacht tot een zojuist gemaakte wijziging door autosave is opgeslagen. */
export async function waitForSaved(page: Page) {
  const status = page.getByRole("status").first();
  await expect(status).toHaveText(/worden opgeslagen|Opslaan/, { timeout: 5_000 }).catch(() => undefined);
  await expect(status).toHaveText(/Opgeslagen om|Alle wijzigingen opgeslagen/, { timeout: 20_000 });
}

export async function markChecked(page: Page, propertyId: string) {
  await page.goto(`/woningen/${propertyId}/gegevens`);
  const box = page.getByRole("checkbox", { name: "Ik heb de woninggegevens gecontroleerd" });
  await box.check();
  await expect(page.getByText(/Gecontroleerd op/)).toBeVisible();
}

export function unique(prefix: string) {
  return `${prefix} ${Date.now().toString(36).slice(-5)}`;
}
