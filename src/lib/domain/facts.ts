import type { FactRow, PropertyRow } from "@/lib/db-types";
import { FIELD_BY_KEY, FIELDS } from "@/lib/domain/property-fields";
import { getFieldValue } from "@/lib/domain/property-mapping";

export type FieldReview = {
  field: string;
  label: string;
  section: string;
  currentValue: string | null;
  status: "conflict" | "onbevestigd" | "bevestigd" | "afgewezen";
  facts: FactRow[];
};

const ORDER = new Map(FIELDS.map((f, i) => [f.key, i]));

/** Groepeert bronfeiten per veld voor de broncontrole; conflicten eerst. */
export function groupFacts(facts: FactRow[], property: Partial<PropertyRow>): FieldReview[] {
  const byField = new Map<string, FactRow[]>();
  for (const f of facts) byField.set(f.field_name, [...(byField.get(f.field_name) ?? []), f]);
  const result: FieldReview[] = [];
  for (const [field, list] of byField) {
    const def = FIELD_BY_KEY.get(field);
    const current = getFieldValue(property, field);
    const status: FieldReview["status"] = list.some((f) => f.verification_status === "conflict")
      ? "conflict"
      : list.some((f) => f.verification_status === "onbevestigd")
        ? "onbevestigd"
        : list.some((f) => f.verification_status === "bevestigd")
          ? "bevestigd"
          : "afgewezen";
    result.push({
      field,
      label: def?.label ?? field,
      section: def?.section ?? "overig",
      currentValue: current === null || current === undefined || current === "" ? null : String(current),
      status,
      facts: list.sort((a, b) => a.created_at.localeCompare(b.created_at)),
    });
  }
  const rank = { conflict: 0, onbevestigd: 1, bevestigd: 2, afgewezen: 3 } as const;
  return result.sort((a, b) => rank[a.status] - rank[b.status] || (ORDER.get(a.field) ?? 999) - (ORDER.get(b.field) ?? 999));
}

/** Markeringen voor het formulier: AI-voorstel (onbevestigd) of conflict. */
export function factHints(facts: FactRow[]): Record<string, { status: "ai" | "conflict"; sources: number }> {
  const out: Record<string, { status: "ai" | "conflict"; sources: number }> = {};
  for (const r of groupFacts(facts, {})) {
    if (r.status === "conflict") out[r.field] = { status: "conflict", sources: r.facts.length };
    else if (r.status === "onbevestigd" && r.facts.some((f) => f.source_type !== "handmatig")) out[r.field] = { status: "ai", sources: r.facts.length };
  }
  return out;
}
