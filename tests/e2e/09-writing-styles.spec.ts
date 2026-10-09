import { test, expect } from "@playwright/test";
import { createProperty, login, markChecked, USERS, unique } from "./helpers";

function editor(page: import("@playwright/test").Page) {
  return page.locator('[role="textbox"][aria-label="Tekst bewerken"]:visible');
}

test.describe("Schrijfstijlen", () => {
  test("de gekozen stijl bepaalt de tekst en staat in de versiegeschiedenis", async ({ page }) => {
    await login(page, USERS.makelaar);
    const id = await createProperty(page, { street: unique("Stijlstraat"), number: "3", city: "Den Haag" });
    await markChecked(page, id);
    await page.goto(`/woningen/${id}/teksten`);

    // Wim – zeer zakelijk: volledige generatie
    await page.getByRole("radio", { name: /Wim – zeer zakelijk/ }).click();
    await page.getByRole("button", { name: "Alle teksten genereren" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Wim – zeer zakelijk");
    await page.getByRole("alertdialog").getByRole("button", { name: "Genereren" }).click();
    await expect(page.getByText("Alle teksten zijn gegenereerd.")).toBeVisible({ timeout: 120_000 });
    await expect(editor(page).getByText(/^Kerngegevens\./).first()).toBeVisible();
    await expect(page.getByText(/v1 · AI-generatie · stijl Wim – zeer zakelijk/).locator("visible=true")).toBeVisible();

    // Vivianne – heel vrolijk: één tekst opnieuw genereren
    await page.getByRole("radio", { name: /Vivianne – heel vrolijk/ }).click();
    await page.getByRole("button", { name: /Opnieuw genereren \(Vivianne/ }).locator("visible=true").click();
    const confirm = page.getByRole("alertdialog");
    if (await confirm.isVisible().catch(() => false)) await confirm.getByRole("button").last().click();
    await expect(editor(page).getByText(/Wat een heerlijke plek!/).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/v2 · AI-generatie · stijl Vivianne – heel vrolijk/).locator("visible=true")).toBeVisible();
  });
});
