import { test, expect } from "@playwright/test";
import { createProperty, login, USERS, unique, waitForSaved } from "./helpers";

test.describe("Woningen", () => {
  test("nieuwe woning aanmaken, automatisch opslaan en terugvinden", async ({ page }) => {
    await login(page, USERS.makelaar);
    const street = unique("Laan van Test");
    const id = await createProperty(page, { street, number: "120", city: "Den Haag", extra: { Bouwjaar: "1912", Woonoppervlakte: "142" } });

    // Velden uit andere secties (opgeslagen als JSON) worden ook bewaard
    await page.getByLabel("Keuken", { exact: true }).fill("Open keuken met kookeiland");
    await page.getByLabel("Belangrijkste verkoopargument").fill("Tuin op het zuiden");
    await page.getByRole("switch", { name: "Prijs vermelden op social media" }).click();
    await waitForSaved(page);

    // Herladen: gegevens zijn bewaard
    await page.reload();
    await expect(page.getByLabel("Keuken", { exact: true })).toHaveValue("Open keuken met kookeiland");
    await expect(page.getByLabel("Belangrijkste verkoopargument")).toHaveValue("Tuin op het zuiden");
    await expect(page.getByRole("switch", { name: "Prijs vermelden op social media" })).toBeChecked();
    await expect(page.getByLabel("Straatnaam")).toHaveValue(street);
    await expect(page.getByLabel("Bouwjaar")).toHaveValue("1912");

    // Ongeldige invoer wordt niet opgeslagen en gemarkeerd
    await page.getByLabel("Postcode").fill("12345");
    await expect(page.getByText("Postcode: gebruik het formaat 1234 AB")).toBeVisible({ timeout: 10_000 });
    await page.getByLabel("Postcode").fill("2517 ab");
    await waitForSaved(page);

    // Terugvinden via zoeken en filteren
    await page.goto("/woningen");
    await page.getByLabel("Zoeken").fill(street.split(" ").at(-1)!);
    await expect(page.getByRole("link", { name: new RegExp(street) })).toBeVisible();
    await page.getByRole("combobox", { name: "Woningtype" }).click();
    await page.getByRole("option", { name: "Appartement" }).click();
    await expect(page.getByText("Geen woningen gevonden")).toBeVisible();
    await page.getByRole("button", { name: "Wissen" }).click();

    // Sorteren op adres
    await page.goto("/woningen?sort=address&dir=asc");
    await expect(page.getByRole("columnheader", { name: /Adres/ })).toHaveAttribute("aria-sort", "ascending");

    await page.goto(`/woningen/${id}`);
    await expect(page.getByRole("heading", { name: new RegExp(street) })).toBeVisible();
  });

  test("woning van een andere organisatie is niet zichtbaar", async ({ page, browser }) => {
    await login(page, USERS.makelaar);
    const id = await createProperty(page, { street: unique("Geheimstraat"), number: "1", city: "Delft" });
    const other = await browser.newPage();
    await login(other, USERS.adminB);
    await other.goto(`/woningen/${id}`);
    await expect(other.getByRole("heading", { name: "Niet gevonden" })).toBeVisible();
    const res = await other.request.post(`/api/woningen/${id}/generatie`, {
      headers: { Origin: "http://localhost:3000" },
      data: { idempotencyKey: "cross-org-0001", overwriteSlots: [] },
    });
    expect(res.status()).toBe(404);
    await other.close();
  });
});
