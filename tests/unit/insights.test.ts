import { describe, expect, it } from "vitest";
import { digestLines } from "@/lib/digest";
import { pairsFromVersions } from "@/lib/data/corrections";

const org = { organisatie: "Kantoor", admins: ["a@example.test"], bewaartermijn_kandidaten: 0, mislukte_generaties_24u: 0, kosten_maand_eur: 0, budget_maand_eur: 300 };

describe("dagelijkse beheerdersmail", () => {
  it("stuurt niets als er niets aan de hand is", () => {
    expect(digestLines(org, true)).toEqual([]);
  });
  it("meldt mislukte generaties, budget boven 80% en bewaartermijn alleen op de eerste van de maand", () => {
    const busy = { ...org, mislukte_generaties_24u: 2, kosten_maand_eur: 250, bewaartermijn_kandidaten: 3 };
    expect(digestLines(busy, false)).toHaveLength(2);
    const lines = digestLines(busy, true);
    expect(lines).toHaveLength(3);
    expect(lines.join(" ")).toMatch(/83%/);
    expect(lines.join(" ")).toMatch(/niets automatisch verwijderd/);
  });
});

describe("leren van correcties", () => {
  const base = { property_id: "p1", channel: "funda" as const, language: "nl" as const, created_at: "2026-10-01T00:00:00Z" };
  it("koppelt de AI-tekst aan de goedgekeurde versie en slaat ongewijzigde goedkeuringen over", () => {
    const pairs = pairsFromVersions([
      { ...base, id: "v1", version_number: 1, content: "<p>Een unieke kans in Den Haag.</p>", source: "ai_generatie", status: "concept" },
      { ...base, id: "v2", version_number: 2, content: "<p>Een ruime woning in Den Haag.</p>", source: "handmatig", status: "goedgekeurd" },
      { ...base, property_id: "p2", id: "w1", version_number: 1, content: "<p>Zelfde tekst.</p>", source: "ai_generatie", status: "goedgekeurd" },
      { ...base, property_id: "p3", id: "x1", version_number: 1, content: "<p>Nog niet goedgekeurd.</p>", source: "ai_generatie", status: "concept" },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ versionId: "v2", ai: "Een unieke kans in Den Haag.", approved: "Een ruime woning in Den Haag." });
  });
});
