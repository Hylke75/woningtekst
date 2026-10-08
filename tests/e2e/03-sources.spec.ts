import path from "node:path";
import { test, expect } from "@playwright/test";
import { createProperty, login, markChecked, USERS, unique, waitForSaved } from "./helpers";

const FIXTURES = path.join(__dirname, "fixtures");

test.describe("Documenten, extractie en broncontrole", () => {
  test("upload, extractie, conflicterende bronnen en handmatige keuze", async ({ page }) => {
    await login(page, USERS.makelaar);
    const id = await createProperty(page, { street: unique("Bronlaan"), number: "12", city: "Den Haag" });

    await page.goto(`/woningen/${id}/bronnen`);
    // Upload twee bronnen met verschillend bouwjaar
    await page.locator('input[type="file"]').setInputFiles([path.join(FIXTURES, "dossier-a.txt"), path.join(FIXTURES, "meetrapport-b.txt")]);
    await expect(page.getByText("2 documenten toegevoegd.")).toBeVisible({ timeout: 30_000 });
    const docs = page.getByRole("list", { name: "Gekoppelde documenten" });
    await expect(docs.getByText("dossier-a.txt")).toBeVisible();
    await expect(docs.getByText("meetrapport-b.txt")).toBeVisible();

    // Analyseer beide documenten
    for (const name of ["dossier-a.txt", "meetrapport-b.txt"]) {
      const row = docs.getByRole("listitem").filter({ hasText: name });
      await row.getByRole("button", { name: "Analyseren" }).click();
      await expect(row.getByText("Geanalyseerd")).toBeVisible({ timeout: 60_000 });
    }

    // Conflict bouwjaar: 1880 vs 1725, handmatige controle vereist
    const bouwjaar = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Bouwjaar" }) });
    await expect(bouwjaar.getByText("Handmatige controle vereist")).toBeVisible();
    await expect(bouwjaar.getByText("1880", { exact: true }).first()).toBeVisible();
    await expect(bouwjaar.getByText("1725", { exact: true })).toBeVisible();

    // Prompt-injectie in het meetrapport wordt gemeld en heeft geen effect
    await expect(page.getByText(/instructies gericht aan de AI; deze zijn genegeerd/)).toBeVisible();

    // Persoonsgegevens uit het dossier zijn niet als gegeven overgenomen
    await expect(page.getByText("Jan de Testpersoon")).toHaveCount(0);
    await expect(page.getByText("verkoper@voorbeeld.test")).toHaveCount(0);

    // Generatie is geblokkeerd zolang er een conflict is
    await page.goto(`/woningen/${id}/teksten`);
    await expect(page.getByText(/conflicterend\(e\) gegeven\(s\)/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Alle teksten genereren" })).toBeDisabled();

    // Medewerker kiest de juiste waarde
    await page.goto(`/woningen/${id}/bronnen`);
    await bouwjaar.getByRole("listitem").filter({ hasText: "1880" }).getByRole("button", { name: "Deze waarde gebruiken" }).click();
    await expect(page.getByText("Bouwjaar: waarde overgenomen.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bouwjaar" })).toHaveCount(0); // niet meer openstaand

    // Voorgestelde waarden staan in het formulier, gemarkeerd als AI-voorstel
    await page.goto(`/woningen/${id}/gegevens`);
    await expect(page.getByLabel("Bouwjaar")).toHaveValue("1880");
    await expect(page.getByLabel("Woonoppervlakte", { exact: true })).toHaveValue("186");
    await expect(page.getByText("AI-voorstel, controleer").first()).toBeVisible();

    // Handmatige correctie
    await page.getByLabel("Woonoppervlakte", { exact: true }).fill("187");
    await waitForSaved(page);
    await page.goto(`/woningen/${id}/bronnen`);
    const opp = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Woonoppervlakte" }) });
    await expect(opp.getByText("Handmatige controle vereist")).toBeVisible();
    await opp.getByRole("button", { name: /Huidige waarde .*187.* is juist/ }).click();
    await expect(page.getByText("Woonoppervlakte: huidige waarde bevestigd.")).toBeVisible();

    // Het dossier noemt een ander straatadres: ook dat conflict beoordeelt de medewerker zelf
    const straat = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Straatnaam" }) });
    await straat.getByRole("button", { name: /Huidige waarde .* is juist/ }).click();
    await expect(page.getByText("Straatnaam: huidige waarde bevestigd.")).toBeVisible();
    await expect(page.getByText("Handmatige controle vereist")).toHaveCount(0);

    await markChecked(page, id);
  });

  test("geplakte omschrijving wordt gestructureerd (snelle invoer)", async ({ page }) => {
    await login(page, USERS.makelaar);
    await page.goto("/woningen/nieuw");
    await page.getByRole("button", { name: "Start met documenten" }).click();
    await page.waitForURL("**/snelle-invoer");
    await page.getByLabel("Woningomschrijving of dossiertekst").fill(
      "Adres: Plaklaan 7\nPlaats: Leiden\nWoningtype: Appartement\nBouwjaar: 1998\nWoonoppervlakte: 84 m2\nEnergielabel: A\nMooi licht appartement met balkon op het zuiden.",
    );
    await page.getByRole("button", { name: "Tekst analyseren" }).click();
    await expect(page.getByText(/gegevens gevonden/)).toBeVisible({ timeout: 60_000 });
    await page.getByRole("link", { name: "Ingevuld formulier controleren" }).click();
    await expect(page.getByLabel("Straatnaam")).toHaveValue("Plaklaan");
    await expect(page.getByLabel("Plaats")).toHaveValue("Leiden");
    await expect(page.getByLabel("Bouwjaar")).toHaveValue("1998");
  });

  test("ongeldig bestand (verkeerde inhoud) wordt geweigerd", async ({ page }) => {
    await login(page, USERS.makelaar);
    const id = await createProperty(page, { street: unique("Uploadweg"), number: "3", city: "Den Haag" });
    await page.goto(`/woningen/${id}/bronnen`);
    await page.locator('input[type="file"]').setInputFiles({ name: "nep.pdf", mimeType: "application/pdf", buffer: Buffer.from("dit is geen pdf maar platte tekst") });
    await expect(page.getByText(/komt niet overeen|kon niet worden vastgesteld/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Er zijn nog geen documenten aan deze woning gekoppeld.")).toBeVisible();
  });
});
