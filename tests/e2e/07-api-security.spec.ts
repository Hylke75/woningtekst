import { test, expect } from "@playwright/test";
import { createProperty, login, USERS, unique } from "./helpers";

test.describe("API-beveiliging", () => {
  test("niet-ingelogde verzoeken en verzoeken zonder origin worden geweigerd", async ({ page, request }) => {
    const anon = await request.post("/api/woningen/00000000-0000-0000-0000-000000000000/generatie", { data: {} });
    expect(anon.status()).toBe(401);

    await login(page, USERS.makelaar);
    const id = await createProperty(page, { street: unique("Origineweg"), number: "1", city: "Den Haag" });
    // Cross-site verzoek (andere Origin) wordt geweigerd (CSRF)
    const cross = await page.request.post(`/api/woningen/${id}/extractie`, {
      headers: { Origin: "https://kwaadwillend.example" },
      data: { idempotencyKey: "csrf-test-0001", source: { type: "text", text: "Bouwjaar: 1900 en meer tekst om te analyseren." } },
    });
    expect(cross.status()).toBe(403);
    // Vervalste of onbekende property_id
    const forged = await page.request.post(`/api/woningen/11111111-1111-4111-8111-111111111111/extractie`, {
      headers: { Origin: "http://localhost:3000" },
      data: { idempotencyKey: "forged-test-0001", source: { type: "text", text: "Bouwjaar: 1900 en meer tekst om te analyseren." } },
    });
    expect(forged.status()).toBe(404);
    // Ongeldige idempotency key / mass assignment in body wordt geweigerd
    const bad = await page.request.post(`/api/woningen/${id}/generatie`, {
      headers: { Origin: "http://localhost:3000" },
      data: { idempotencyKey: "x", overwriteSlots: ["funda:nl"], organization_id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(bad.status()).toBe(400);
    // Foutmeldingen bevatten geen stacktraces of interne details
    const body = await bad.json();
    expect(JSON.stringify(body)).not.toMatch(/at |\.ts|postgres|stack/i);
  });

  test("documentdownload van een andere organisatie geeft geen toegang", async ({ page, browser }) => {
    await login(page, USERS.makelaar);
    const id = await createProperty(page, { street: unique("Downloadlaan"), number: "8", city: "Den Haag" });
    await page.goto(`/woningen/${id}/bronnen`);
    await page.locator('input[type="file"]').setInputFiles({ name: "notitie.txt", mimeType: "text/plain", buffer: Buffer.from("Bouwjaar: 1930\nWoonoppervlakte: 99 m2") });
    await expect(page.getByText("Document toegevoegd.")).toBeVisible({ timeout: 30_000 });
    const href = await page.getByRole("link", { name: "notitie.txt downloaden" }).getAttribute("href");
    expect(href).toMatch(/^\/api\/documenten\/[0-9a-f-]{36}\/download$/);

    // Eigen organisatie: kortlevende signed URL
    const own = await page.request.get(href!, { maxRedirects: 0 });
    expect(own.status()).toBe(303);
    expect(own.headers()["location"]).toMatch(/token=/);

    const other = await browser.newPage();
    await login(other, USERS.adminB);
    const res = await other.request.get(href!, { maxRedirects: 0 });
    expect(res.status()).toBe(404);
    await other.close();
  });
});
