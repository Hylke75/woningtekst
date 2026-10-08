import { test, expect } from "@playwright/test";
import { knownMfaSecret, login, logout, resetMfa, USERS, PASSWORD } from "./helpers";

test.describe("Twee-stapsverificatie", () => {
  test("admin zonder MFA wordt voor beheerfuncties naar /beveiliging gestuurd; gewone pagina's werken", async ({ page }) => {
    await resetMfa(USERS.adminB);
    await login(page, USERS.adminB, { skipMfaSetup: true });
    await expect(page.getByText("Stel twee-stapsverificatie in om beheerfuncties te gebruiken.").first()).toBeVisible();
    await page.goto("/woningen");
    await expect(page).toHaveURL(/\/woningen$/);
    await page.goto("/gebruikers");
    await expect(page).toHaveURL(/\/beveiliging\?melding=mfa-vereist/);
    await expect(page.getByText("Stel twee-stapsverificatie in om beheerfuncties te gebruiken.").first()).toBeVisible();
  });

  test("admin stelt MFA in en logt daarna in met een code; onjuiste code wordt geweigerd", async ({ page }) => {
    await login(page, USERS.adminB); // schrijft de factor in via /beveiliging
    expect(knownMfaSecret(USERS.adminB)).toBeTruthy();
    await page.goto("/gebruikers");
    await expect(page.getByRole("heading", { name: "Gebruikersbeheer" })).toBeVisible();
    await logout(page);

    await page.goto("/inloggen");
    await page.getByLabel("E-mailadres").fill(USERS.adminB);
    await page.getByLabel("Wachtwoord").fill(PASSWORD);
    await page.getByRole("button", { name: "Inloggen" }).click();
    await page.waitForURL("**/inloggen/verificatie**");
    // Zonder code geen toegang tot de app.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/inloggen\/verificatie/);
    await page.getByLabel("Verificatiecode").fill("000000");
    await page.getByRole("button", { name: "Bevestigen" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /onjuist/ })).toHaveText(/onjuist of verlopen/);

    await page.context().clearCookies();
    await login(page, USERS.adminB);
    await page.goto("/beveiliging");
    await expect(page.getByText("Aan", { exact: true })).toBeVisible();
  });
});
