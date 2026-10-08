import { test, expect } from "@playwright/test";
import { login, logout, USERS, PASSWORD } from "./helpers";

test.describe("Authenticatie en rollen", () => {
  test("niet-ingelogde gebruiker wordt naar inloggen gestuurd", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/inloggen\?volgende=%2Fdashboard/);
  });

  test("onjuist wachtwoord geeft een generieke melding", async ({ page }) => {
    await page.goto("/inloggen");
    await page.getByLabel("E-mailadres").fill(USERS.makelaar);
    await page.getByLabel("Wachtwoord").fill(PASSWORD + "x");
    await page.getByRole("button", { name: "Inloggen" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /onjuist/ })).toHaveText("E-mailadres of wachtwoord is onjuist.");
  });

  test("inloggen en uitloggen", async ({ page }) => {
    await login(page, USERS.makelaar);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await logout(page);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/inloggen/);
  });

  test("wachtwoord vergeten toont altijd dezelfde melding", async ({ page }) => {
    await page.goto("/wachtwoord-vergeten");
    await page.getByLabel("E-mailadres").fill("onbekend@example.test");
    await page.getByRole("button", { name: "Herstellink versturen" }).click();
    await expect(page.getByText(/Als dit e-mailadres bij ons bekend is/)).toBeVisible();
  });

  test("redacteur ziet geen beheerfuncties en kan ze niet openen", async ({ page }) => {
    await login(page, USERS.redacteur);
    await expect(page.getByRole("link", { name: "Gebruikersbeheer" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Nieuwe woning" })).toHaveCount(0);
    await page.goto("/gebruikers");
    await expect(page).toHaveURL(/dashboard/);
    await page.goto("/woningen/nieuw");
    await expect(page).toHaveURL(/dashboard/);
  });

  test("administrator ziet gebruikersbeheer met alle rollen", async ({ page }) => {
    await login(page, USERS.admin);
    await page.getByRole("link", { name: "Gebruikersbeheer" }).click();
    await expect(page.getByRole("heading", { name: "Gebruikersbeheer" })).toBeVisible();
    await expect(page.getByRole("cell", { name: USERS.redacteur })).toBeVisible();
    await expect(page.getByRole("cell", { name: USERS.adminB })).toHaveCount(0);
  });
});
