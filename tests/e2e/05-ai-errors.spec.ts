import { test, expect } from "@playwright/test";
import { createProperty, login, markChecked, USERS, unique, waitForSaved } from "./helpers";

test.describe("Fouten en timeouts van de Claude API", () => {
  test("timeout stopt de generatie netjes en de job is hervatbaar zonder dubbele records", async ({ page }) => {
    await login(page, USERS.makelaar);
    const id = await createProperty(page, { street: unique("Foutstraat"), number: "9", city: "Den Haag" });
    // Testhaak (alleen in mockmodus): simuleer een tijdelijke timeout van Claude
    await page.getByLabel("Bijzondere instructies").fill("[[MOCK_TIMEOUT_EENMALIG]]");
    await waitForSaved(page);
    await markChecked(page, id);

    await page.goto(`/woningen/${id}/teksten`);
    await page.getByRole("button", { name: "Alle teksten genereren" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Genereren" }).click();
    await expect(page.getByText("Claude reageerde niet op tijd. Probeer het opnieuw.").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Hervatten" })).toBeVisible();
    // Geen eindeloze 'bezig'-status
    await expect(page.getByRole("button", { name: "Bezig met genereren…" })).toHaveCount(0);

    // Hervatten: dezelfde job gaat verder vanaf de mislukte stap
    await page.reload();
    await page.getByRole("button", { name: "Hervatten" }).click();
    await expect(page.getByText("Alle teksten zijn gegenereerd.")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText(/v1 · AI-generatie/).locator("visible=true")).toBeVisible();

    // Fout wordt geregistreerd in het AI-verbruik
    await page.goto("/instellingen");
    await expect(page.getByText("ai_timeout").first()).toBeVisible();
  });

  test("hervatten na gewijzigde woninggegevens is niet mogelijk; opnieuw starten wel", async ({ page }) => {
    await login(page, USERS.makelaar);
    const id = await createProperty(page, { street: unique("Wijzigstraat"), number: "3", city: "Den Haag" });
    await page.getByLabel("Bijzondere instructies").fill("[[MOCK_TIMEOUT]]");
    await waitForSaved(page);
    await markChecked(page, id);
    await page.goto(`/woningen/${id}/teksten`);
    await page.getByRole("button", { name: "Alle teksten genereren" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Genereren" }).click();
    await expect(page.getByText("Claude reageerde niet op tijd. Probeer het opnieuw.").first()).toBeVisible({ timeout: 60_000 });

    await page.goto(`/woningen/${id}/gegevens`);
    await page.getByLabel("Bijzondere instructies").fill("Benadruk de rustige ligging.");
    await waitForSaved(page);
    await markChecked(page, id);
    await page.goto(`/woningen/${id}/teksten`);
    await page.getByRole("button", { name: "Hervatten" }).click();
    await expect(page.getByText(/zijn gewijzigd sinds de start/).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Alle teksten genereren" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Genereren" }).click();
    await expect(page.getByText("Alle teksten zijn gegenereerd.")).toBeVisible({ timeout: 120_000 });
  });

  test("ongeldig AI-antwoord en API-fout bij één tekst geven een duidelijke melding", async ({ page }) => {
    await login(page, USERS.makelaar);
    const id = await createProperty(page, { street: unique("Antwoordweg"), number: "2", city: "Den Haag" });
    await markChecked(page, id);
    await page.goto(`/woningen/${id}/teksten`);
    await page.getByRole("button", { name: "Alle teksten genereren" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Genereren" }).click();
    await expect(page.getByText("Alle teksten zijn gegenereerd.")).toBeVisible({ timeout: 120_000 });

    await page.getByLabel("Optionele instructie bij opnieuw genereren").locator("visible=true").fill("[[MOCK_ONGELDIG]]");
    await page.getByRole("button", { name: "Opnieuw genereren" }).locator("visible=true").click();
    await expect(page.getByText("Het antwoord van Claude voldeed niet aan het verwachte formaat.").or(page.getByText("Claude gaf een onleesbaar antwoord."))).toBeVisible({ timeout: 60_000 });

    await page.getByLabel("Optionele instructie bij opnieuw genereren").locator("visible=true").fill("[[MOCK_FOUT]]");
    await page.getByRole("button", { name: "Opnieuw genereren" }).locator("visible=true").click();
    await expect(page.getByText("Claude is tijdelijk niet bereikbaar. Probeer het opnieuw.")).toBeVisible({ timeout: 60_000 });
    // Bestaande tekst blijft ongewijzigd
    await expect(page.getByText(/v1 · AI-generatie/).locator("visible=true")).toBeVisible();
  });

  test("'Controleer deze tekst' doet voorstellen zonder de tekst automatisch te wijzigen", async ({ page }) => {
    await login(page, USERS.makelaar);
    const id = await createProperty(page, { street: unique("Controlelaan"), number: "4", city: "Den Haag" });
    await markChecked(page, id);
    await page.goto(`/woningen/${id}/teksten`);
    await page.getByRole("button", { name: "Alle teksten genereren" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Genereren" }).click();
    await expect(page.getByText("Alle teksten zijn gegenereerd.")).toBeVisible({ timeout: 120_000 });

    const ed = page.locator('[role="textbox"][aria-label="Tekst bewerken"]:visible');
    await expect(page.getByText(/v1 · AI-generatie/).locator("visible=true")).toBeVisible();
    await ed.focus();
    await page.keyboard.press("Control+Home");
    await page.keyboard.type("Dit is een unieke kans. ");
    await expect(page.getByText("Niet opgeslagen").locator("visible=true")).toBeVisible();
    await page.getByRole("button", { name: "Controleer deze tekst" }).locator("visible=true").click();
    const review = page.getByRole("region", { name: "Redactionele controle" });
    await expect(review.getByText("een unieke kans")).toBeVisible({ timeout: 60_000 });
    // Niets automatisch gewijzigd
    await expect(ed.getByText(/een unieke kans/)).toBeVisible();
    await review.getByRole("button", { name: "Accepteren" }).click();
    await expect(ed.getByText(/een unieke kans/)).toHaveCount(0);
    await expect(ed.getByText(/zeldzame combinatie van ruimte en ligging/)).toBeVisible();
  });
});
