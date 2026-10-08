import { expect, type Page } from "@playwright/test";

export const PASSWORD = "Testwachtwoord123";
export const USERS = {
  admin: "admin@example.test",
  makelaar: "makelaar@example.test",
  redacteur: "redacteur@example.test",
  adminB: "admin-b@example.test",
} as const;

export async function login(page: Page, email: string) {
  await page.goto("/inloggen");
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByLabel("Wachtwoord").fill(PASSWORD);
  await page.getByRole("button", { name: "Inloggen" }).click();
  await page.waitForURL("**/dashboard");
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
