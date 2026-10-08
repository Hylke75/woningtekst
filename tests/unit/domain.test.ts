import { describe, expect, it } from "vitest";
import { can } from "@/lib/auth/permissions";
import { safeNextPath } from "@/lib/auth/redirect";
import { FIELDS, fieldValueSchema, propertyPatchSchema } from "@/lib/domain/property-fields";
import { getFieldValue, missingForGeneration, patchToRpcArgs, propertyLabel, rowToFormValues } from "@/lib/domain/property-mapping";
import { groupFacts, factHints } from "@/lib/domain/facts";
import type { FactRow, PropertyRow } from "@/lib/db-types";

describe("rolrechten", () => {
  it("standaard keuren alleen administrator en makelaar goed", () => {
    expect(can("admin", "texts.approve")).toBe(true);
    expect(can("makelaar", "texts.approve")).toBe(true);
    expect(can("redacteur", "texts.approve")).toBe(false);
  });
  it("goedkeuring is configureerbaar per organisatie", () => {
    expect(can("redacteur", "texts.approve", ["admin", "redacteur"])).toBe(true);
    expect(can("makelaar", "texts.approve", ["admin"])).toBe(false);
  });
  it("redacteur kan schrijven en indienen, maar geen woningen beheren of alles genereren", () => {
    expect(can("redacteur", "texts.edit")).toBe(true);
    expect(can("redacteur", "texts.submit")).toBe(true);
    expect(can("redacteur", "properties.edit")).toBe(false);
    expect(can("redacteur", "texts.generate_all")).toBe(false);
    expect(can("redacteur", "users.manage")).toBe(false);
  });
  it("alleen admin beheert gebruikers, schrijfwijzer en instellingen", () => {
    for (const cap of ["users.manage", "styleguide.edit", "settings.edit", "properties.purge"] as const) {
      expect(can("admin", cap)).toBe(true);
      expect(can("makelaar", cap)).toBe(false);
    }
  });
  it("zonder rol geen rechten", () => {
    expect(can(null, "texts.edit")).toBe(false);
  });
});

describe("veilige doorstuurpaden", () => {
  it.each([
    ["/woningen", "/woningen"],
    ["//evil.example", "/dashboard"],
    ["https://evil.example", "/dashboard"],
    ["/\\evil", "/dashboard"],
    ["javascript:alert(1)", "/dashboard"],
    [null, "/dashboard"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input as string | null)).toBe(expected);
  });
});

describe("veldvalidatie", () => {
  it("normaliseert postcodes en weigert ongeldige", () => {
    expect(fieldValueSchema("postcode").parse("2517ab")).toBe("2517 AB");
    expect(fieldValueSchema("postcode").safeParse("0517 AB").success).toBe(false);
    expect(fieldValueSchema("postcode").parse("")).toBeNull();
  });
  it("parseert bedragen in Nederlandse notatie", () => {
    expect(fieldValueSchema("asking_price").parse("€ 1.250.000")).toBe(1250000);
    expect(fieldValueSchema("asking_price").safeParse("-5").success).toBe(false);
  });
  it("weigert onrealistische bouwjaren", () => {
    expect(fieldValueSchema("year_built").safeParse("3020").success).toBe(false);
    expect(fieldValueSchema("year_built").parse("1880")).toBe(1880);
  });
  it("accepteert alleen geldige keuzeopties", () => {
    expect(fieldValueSchema("energy_label").safeParse("Z").success).toBe(false);
    expect(fieldValueSchema("energy_label").parse("A++")).toBe("A++");
  });
  it("hashtags worden gesplitst en opgeschoond", () => {
    expect(fieldValueSchema("publicatie.extra_hashtags").parse("#DenHaag, statenkwartier #wonen")).toEqual(["DenHaag", "statenkwartier", "wonen"]);
    expect(fieldValueSchema("publicatie.extra_hashtags").safeParse("#a-b").success).toBe(false);
  });
  it("links moeten http(s) zijn", () => {
    expect(fieldValueSchema("publicatie.funda_url").safeParse("javascript:alert(1)").success).toBe(false);
    expect(fieldValueSchema("publicatie.funda_url").parse("https://www.funda.nl/koop/den-haag/")).toMatch(/^https:/);
  });
  it("patchschema weigert onbekende sleutels (mass assignment)", () => {
    expect(propertyPatchSchema.safeParse({ organization_id: "x" }).success).toBe(false);
    expect(propertyPatchSchema.safeParse({ created_by: "x", address: "Straat" }).success).toBe(false);
    expect(propertyPatchSchema.safeParse({ address: "Straat" }).success).toBe(true);
  });
  it("alle velden hebben een unieke sleutel en een sectie", () => {
    const keys = FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(FIELDS.filter((f) => f.requiredForGeneration).map((f) => f.key)).toEqual(["address", "house_number", "city", "property_type"]);
  });
  it("positionering en publicatie worden nooit door AI geëxtraheerd", () => {
    expect(FIELDS.filter((f) => (f.section === "positionering" || f.section === "publicatie") && f.extractable)).toHaveLength(0);
  });
});

describe("mapping woningprofiel", () => {
  const row: Partial<PropertyRow> = {
    address: "Laan van Meerdervoort",
    house_number: "120",
    addition: "A",
    city: "Den Haag",
    property_type: "Herenhuis",
    facts_json: { kenmerken: { keuken: "Open keuken" } },
    positioning_json: { usp_1: "Tuin op het zuiden" },
    publication_json: { prijs_op_social: true, extra_hashtags: ["DenHaag"] },
  };
  it("leest waarden uit kolommen en JSON-secties", () => {
    expect(getFieldValue(row, "address")).toBe("Laan van Meerdervoort");
    expect(getFieldValue(row, "kenmerken.keuken")).toBe("Open keuken");
    expect(getFieldValue(row, "positionering.usp_1")).toBe("Tuin op het zuiden");
    expect(getFieldValue(row, "publicatie.prijs_op_social")).toBe(true);
    expect(getFieldValue(row, "locatie.parken")).toBeNull();
  });
  it("zet formulierwaarden om", () => {
    const v = rowToFormValues(row);
    expect(v["publicatie.extra_hashtags"]).toEqual(["DenHaag"]);
    expect(v["kenmerken.isolatie"]).toBe("");
  });
  it("splitst een patch naar RPC-argumenten; lege lijst = verwijderen", () => {
    expect(patchToRpcArgs({ address: "X", "kenmerken.keuken": null, "positionering.usp_1": "Y", "publicatie.extra_hashtags": [] })).toEqual({
      p_columns: { address: "X" },
      p_facts: { kenmerken: { keuken: null } },
      p_positioning: { usp_1: "Y" },
      p_publication: { extra_hashtags: null },
    });
    expect(patchToRpcArgs({ onbekend: 1 })).toEqual({ p_columns: {}, p_facts: null, p_positioning: null, p_publication: null });
  });
  it("bepaalt ontbrekende verplichte velden", () => {
    expect(missingForGeneration(row)).toEqual([]);
    expect(missingForGeneration({ address: "x" }).map((f) => f.key)).toEqual(["house_number", "city", "property_type"]);
  });
  it("maakt een leesbaar label", () => {
    expect(propertyLabel(row as PropertyRow)).toBe("Laan van Meerdervoort 120 A, Den Haag");
    expect(propertyLabel({ address: null, house_number: null, addition: null, city: null })).toBe("Nieuwe woning (adres onbekend)");
  });
});

describe("broncontrole", () => {
  const fact = (o: Partial<FactRow>): FactRow => ({
    id: Math.random().toString(),
    property_id: "p",
    organization_id: "o",
    field_name: "year_built",
    field_value: "1880",
    source_type: "document",
    source_document_id: "d1",
    source_reference: null,
    source_quote: null,
    confidence: "hoog",
    verification_status: "onbevestigd",
    verified_by: null,
    verified_at: null,
    extraction_job_id: null,
    created_at: new Date().toISOString(),
    ...o,
  });
  it("toont conflicten eerst", () => {
    const groups = groupFacts(
      [fact({ field_name: "rooms", field_value: "5", verification_status: "bevestigd" }), fact({ verification_status: "conflict" }), fact({ field_value: "1725", verification_status: "conflict" })],
      { year_built: 1880, rooms: 5 },
    );
    expect(groups.map((g) => [g.field, g.status])).toEqual([
      ["year_built", "conflict"],
      ["rooms", "bevestigd"],
    ]);
    expect(groups[0].facts).toHaveLength(2);
    expect(groups[0].currentValue).toBe("1880");
  });
  it("markeert AI-voorstellen en conflicten voor het formulier", () => {
    const hints = factHints([fact({}), fact({ field_name: "rooms", verification_status: "conflict" }), fact({ field_name: "toilets", source_type: "handmatig" })]);
    expect(hints).toEqual({ year_built: { status: "ai", sources: 1 }, rooms: { status: "conflict", sources: 1 } });
  });
});
