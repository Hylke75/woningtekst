import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { login, USERS } from "./helpers";

/**
 * Toegankelijkheid: axe-core scant de belangrijkste pagina's op WCAG 2.1 A/AA.
 * De test faalt op overtredingen met impact "serious" of "critical"; lichtere
 * meldingen worden alleen gelogd zodat ze zichtbaar blijven.
 */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BLOCKING = new Set(["serious", "critical"]);

const PUBLIC_PAGES = ["/inloggen", "/registreren", "/wachtwoord-vergeten"];
const ADMIN_PAGES = ["/dashboard", "/woningen", "/woningen/nieuw", "/schrijfwijzer", "/instellingen", "/gebruikers"];

async function scan(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("load");
  // Pagina's tonen altijd een kop; wacht daarop zodat de inhoud gerenderd en gehydrateerd is.
  await expect(page.getByRole("heading").first()).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const blocking = violations.filter((v) => v.impact && BLOCKING.has(v.impact));
  const minor = violations.filter((v) => !blocking.includes(v));

  const describe = (list: typeof violations) =>
    list.map((v) => `  [${v.impact}] ${v.id}: ${v.help}\n${v.nodes.map((n) => `    - ${n.target.join(" ")}: ${n.html.slice(0, 160)}\n      ${(n.failureSummary ?? "").replace(/\n/g, " ")}`).join("\n")}`).join("\n");

  if (minor.length) console.log(`a11y ${path} (niet-blokkerend):\n${describe(minor)}`);
  // soft: alle pagina's worden gescand en samen gerapporteerd.
  const summary = blocking.map((v) => `[${v.impact}] ${v.id} @ ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect.soft(summary, `Ernstige toegankelijkheidsproblemen op ${path}:\n${describe(blocking)}`).toEqual([]);
}

test.describe("Toegankelijkheid (axe)", () => {
  for (const path of PUBLIC_PAGES) {
    test(`zonder login: ${path}`, async ({ page }) => {
      await scan(page, path);
    });
  }

  test("als admin: hoofdpagina's", async ({ page }) => {
    await login(page, USERS.admin);
    for (const path of ADMIN_PAGES) {
      await test.step(path, async () => {
        await scan(page, path);
      });
    }
  });
});
