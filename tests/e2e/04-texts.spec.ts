import { test, expect, type Page } from "@playwright/test";
import { createProperty, login, logout, markChecked, USERS, unique } from "./helpers";

async function generateAll(page: Page, propertyId: string) {
  await page.goto(`/woningen/${propertyId}/teksten`);
  await page.getByRole("button", { name: "Alle teksten genereren" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Genereren" }).click();
  await expect(page.getByText("Alle teksten zijn gegenereerd.")).toBeVisible({ timeout: 120_000 });
}

function editor(page: Page) {
  return page.locator('[role="textbox"][aria-label="Tekst bewerken"]:visible');
}

test.describe("Teksten genereren, bewerken en goedkeuren", () => {
  test("volledige workflow voor acht teksten", async ({ page, context }) => {
    await login(page, USERS.makelaar);
    const street = unique("Generatielaan");
    const id = await createProperty(page, { street, number: "5", city: "Den Haag", extra: { Woonoppervlakte: "142", Bouwjaar: "1928" } });
    await markChecked(page, id);
    await generateAll(page, id);

    // Funda NL zichtbaar met vaste structuur
    await expect(page.getByRole("tab", { name: /Funda/ })).toHaveAttribute("aria-selected", "true");
    await expect(editor(page).getByRole("heading", { name: "Locatie" })).toBeVisible();
    await expect(editor(page).getByRole("heading", { name: new RegExp(`Wat je graag wilt weten over ${street}`) })).toBeVisible();
    await expect(editor(page).getByText(/Deze informatie is door ons met de nodige zorgvuldigheid samengesteld/)).toBeVisible();

    // Engels: aparte tekst met Engelse koppen
    await page.getByRole("radio", { name: "Engels" }).click();
    await expect(editor(page).getByRole("heading", { name: "Location" })).toBeVisible();
    await expect(editor(page).getByText(/This information has been compiled by us with due care/)).toBeVisible();

    // Alle acht kanalen/talen hebben een versie
    for (const channel of ["Website", "Facebook", "Instagram"]) {
      await page.getByRole("tab", { name: new RegExp(channel) }).click();
      for (const lang of ["Nederlands", "Engels"]) {
        await page.getByRole("radio", { name: lang }).click();
        await expect(page.getByText(/v1 · AI-generatie/).locator("visible=true")).toBeVisible();
      }
    }

    // SEO kopiëren (website)
    await page.getByRole("tab", { name: /Website/ }).click();
    await page.getByRole("radio", { name: "Nederlands" }).click();
    await expect(page.getByLabel("SEO-titel").locator("visible=true")).not.toHaveValue("");
    await page.getByRole("button", { name: "Alles kopiëren" }).locator("visible=true").click();
    await expect(page.getByText("SEO-gegevens gekopieerd.")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/SEO-titel: .+\nMetaomschrijving: .+\nSlug: [a-z0-9-]+/);

    // Hashtags kopiëren (Instagram)
    await page.getByRole("tab", { name: /Instagram/ }).click();
    await page.getByRole("region", { name: "Hashtags" }).locator("visible=true").getByRole("button", { name: "Kopiëren" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/#KorffdeGidts/);

    // Facebook NL afzonderlijk wijzigen en opslaan
    await page.getByRole("tab", { name: /Facebook/ }).click();
    await page.getByRole("radio", { name: "Nederlands" }).click();
    await editor(page).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" Handmatige aanvulling door de makelaar.");
    await expect(page.getByText("Niet opgeslagen").locator("visible=true")).toBeVisible();
    await page.getByRole("button", { name: "Opslaan" }).locator("visible=true").click();
    await expect(page.getByText("Opgeslagen als versie 2.")).toBeVisible();
    await expect(page.getByText(/v2 · Handmatig bewerkt/).locator("visible=true")).toBeVisible();
    // Andere teksten blijven op versie 1
    await page.getByRole("radio", { name: "Engels" }).click();
    await expect(page.getByText(/v1 · AI-generatie/).locator("visible=true")).toBeVisible();

    // Eén tekst opnieuw genereren (Instagram EN)
    await page.getByRole("tab", { name: /Instagram/ }).click();
    await page.getByRole("radio", { name: "Engels" }).click();
    await page.getByRole("button", { name: "Opnieuw genereren" }).locator("visible=true").click();
    await expect(page.getByText("Nieuwe tekst opgeslagen als versie 2.")).toBeVisible({ timeout: 60_000 });

    // Versiegeschiedenis en herstel
    await page.getByRole("tab", { name: /Facebook/ }).click();
    await page.getByRole("radio", { name: "Nederlands" }).click();
    await page.getByRole("button", { name: /Versies \(2\)/ }).locator("visible=true").click();
    const sheet = page.getByRole("dialog", { name: /Versiegeschiedenis/ });
    await expect(sheet.getByText("Versie 2")).toBeVisible();
    await sheet.getByRole("listitem").filter({ hasText: "Versie 1" }).getByRole("button", { name: "Herstel deze versie" }).click();
    await expect(page.getByText("Versie 1 hersteld als versie 3.")).toBeVisible();
    await expect(editor(page).getByText("Handmatige aanvulling door de makelaar.")).toHaveCount(0);

    // Waarschuwing bij hergeneratie met niet-opgeslagen wijzigingen
    await editor(page).click();
    await page.keyboard.type(" Nog niet opgeslagen.");
    await page.getByRole("button", { name: "Opnieuw genereren" }).locator("visible=true").click();
    await expect(page.getByRole("alertdialog", { name: "Niet-opgeslagen wijzigingen" })).toBeVisible();
    await page.getByRole("button", { name: "Annuleren" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Opslaan" }).locator("visible=true").click();
    await expect(page.getByText("Opgeslagen als versie 4.")).toBeVisible();

    // Volledige hergeneratie beschermt handmatig bewerkte teksten
    await page.getByRole("button", { name: "Alle teksten genereren" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText(/worden standaard NIET vervangen/)).toBeVisible();
    await expect(dialog.getByLabel("Facebook nederlands")).not.toBeChecked();
    await dialog.getByRole("button", { name: "Annuleren" }).click();

    // Goedkeuren door makelaar
    await page.getByRole("button", { name: "Goedkeuren" }).locator("visible=true").click();
    await expect(page.getByText("Tekst goedgekeurd.")).toBeVisible();
    await expect(page.getByText(/Goedgekeurd door Test makelaar/).locator("visible=true")).toBeVisible();

    // Redacteur: kan indienen, niet goedkeuren
    await logout(page);
    await login(page, USERS.redacteur);
    await page.goto(`/woningen/${id}/teksten`);
    await expect(page.getByRole("button", { name: "Alle teksten genereren" })).toHaveCount(0);
    await page.getByRole("tab", { name: /Website/ }).click();
    await expect(page.getByRole("button", { name: "Goedkeuren" }).locator("visible=true")).toHaveCount(0);
    await page.getByRole("button", { name: "Ter goedkeuring aanbieden" }).locator("visible=true").click();
    await expect(page.getByText("Ter controle aangeboden.")).toBeVisible();
    // Direct API-verzoek om goed te keuren wordt geweigerd
    const res = await context.request.post(`/api/woningen/${id}/generatie`, {
      headers: { Origin: "http://localhost:3000" },
      data: { idempotencyKey: "redacteur-gen-01", overwriteSlots: [] },
    });
    expect(res.status()).toBe(403);
  });

  test("ontbrekende gegevens en ongecontroleerde gegevens blokkeren generatie", async ({ page }) => {
    await login(page, USERS.makelaar);
    await page.goto("/woningen/nieuw");
    await page.getByRole("button", { name: "Start handmatig" }).click();
    await page.waitForURL("**/gegevens");
    const id = page.url().match(/woningen\/([0-9a-f-]{36})/)![1];
    await page.goto(`/woningen/${id}/teksten`);
    await expect(page.getByText(/Vul eerst in: straatnaam, huisnummer, plaats, woningtype/)).toBeVisible();
    await expect(page.getByText(/Bevestig op het tabblad Gegevens/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Alle teksten genereren" })).toBeDisabled();
    const res = await page.request.post(`/api/woningen/${id}/generatie`, {
      headers: { Origin: "http://localhost:3000" },
      data: { idempotencyKey: "blocked-gen-0001", overwriteSlots: [] },
    });
    expect(res.status()).toBe(400);
  });
});
