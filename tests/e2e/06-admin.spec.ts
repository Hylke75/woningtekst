import { test, expect } from "@playwright/test";
import { login, USERS } from "./helpers";

test.describe("Beheer", () => {
  test("schrijfwijzer: nieuwe versie publiceren en versiegeschiedenis", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/schrijfwijzer");
    await expect(page.getByText(/Actieve versie \d+/)).toBeVisible();
    const before = Number((await page.getByText(/Actieve versie \d+/).textContent())!.match(/\d+/)![0]);
    const content = page.getByLabel("Inhoud (Markdown)");
    await content.fill((await content.inputValue()) + "\n\n- extra cliché om te vermijden\n");
    await page.getByLabel("Wat is er gewijzigd?").fill("Clichélijst aangevuld (E2E)");
    await page.getByRole("button", { name: "Publiceren als nieuwe versie" }).click();
    await expect(page.getByText(`Versie ${before + 1} gepubliceerd en geactiveerd.`, { exact: false })).toBeVisible();
    await expect(page.getByText(`Actieve versie ${before + 1}`)).toBeVisible();
    await expect(page.getByText("Clichélijst aangevuld (E2E)")).toBeVisible();
  });

  test("makelaar kan de schrijfwijzer bekijken maar niet bewerken", async ({ page }) => {
    await login(page, USERS.makelaar);
    await page.goto("/schrijfwijzer");
    await expect(page.getByRole("heading", { name: /Schrijfwijzer Korff de Gidts|Schrijfwijzer/ }).first()).toBeVisible();
    await expect(page.getByLabel("Inhoud (Markdown)")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Publiceren als nieuwe versie" })).toHaveCount(0);
  });

  test("gebruiker uitnodigen en instellingen wijzigen", async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto("/gebruikers");
    const email = `nieuw-${Date.now()}@example.test`;
    await page.getByLabel("E-mailadres").fill(email);
    await page.getByRole("button", { name: "Uitnodigen" }).click();
    await expect(page.getByText("Uitnodiging aangemaakt.")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: email })).toBeVisible();
    await page.getByRole("button", { name: `Uitnodiging voor ${email} intrekken` }).click();
    await expect(page.getByText("Uitnodiging ingetrokken.")).toBeVisible();

    await page.goto("/instellingen");
    await page.getByLabel("Dagbudget AI (€)").fill("40");
    await page.getByRole("button", { name: "Instellingen opslaan" }).click();
    await expect(page.getByText("Instellingen opgeslagen.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Auditlog" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "organization_settings" }).first()).toBeVisible();
  });
});
