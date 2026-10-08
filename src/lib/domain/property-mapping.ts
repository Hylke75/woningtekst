import type { PropertyRow } from "@/lib/db-types";
import { FIELDS, FIELD_BY_KEY, type FieldDef } from "@/lib/domain/property-fields";

/** JSON-kolom waarin een niet-kolomveld wordt bewaard. */
export function jsonTarget(f: FieldDef): { column: "facts_json" | "positioning_json" | "publication_json"; group?: string; name: string } {
  const [group, name] = f.key.split(".");
  if (f.section === "positionering") return { column: "positioning_json", name };
  if (f.section === "publicatie") return { column: "publication_json", name };
  return { column: "facts_json", group, name };
}

export function getFieldValue(row: Partial<PropertyRow>, key: string): unknown {
  const f = FIELD_BY_KEY.get(key);
  if (!f) return undefined;
  if (f.column) return (row as Record<string, unknown>)[f.column] ?? null;
  const t = jsonTarget(f);
  const json = (row[t.column] ?? {}) as Record<string, unknown>;
  if (t.group) return ((json[t.group] ?? {}) as Record<string, unknown>)[t.name] ?? null;
  return json[t.name] ?? null;
}

/** Waarde → formulierwaarde (strings voor invoervelden). */
export function toFormValue(f: FieldDef, value: unknown): string | boolean | string[] {
  if (value === null || value === undefined) return f.kind === "boolean" ? false : f.kind === "tags" ? [] : "";
  if (f.kind === "boolean") return Boolean(value);
  if (f.kind === "tags") return Array.isArray(value) ? (value as string[]) : [];
  return String(value);
}

export function rowToFormValues(row: Partial<PropertyRow>): Record<string, string | boolean | string[]> {
  const out: Record<string, string | boolean | string[]> = {};
  for (const f of FIELDS) out[f.key] = toFormValue(f, getFieldValue(row, f.key));
  return out;
}

export function missingForGeneration(row: Partial<PropertyRow>): FieldDef[] {
  return FIELDS.filter((f) => f.requiredForGeneration).filter((f) => {
    const v = getFieldValue(row, f.key);
    return v === null || v === undefined || String(v).trim() === "";
  });
}

export function propertyLabel(row: Pick<PropertyRow, "address" | "house_number" | "addition" | "city">): string {
  const street = [row.address, row.house_number, row.addition].filter(Boolean).join(" ").trim();
  if (!street) return "Nieuwe woning (adres onbekend)";
  return row.city ? `${street}, ${row.city}` : street;
}

export function streetLabel(row: Pick<PropertyRow, "address" | "house_number" | "addition">): string {
  return [row.address, row.house_number, row.addition].filter(Boolean).join(" ").trim() || "deze woning";
}

/** Zet een gevalideerde patch om naar argumenten voor de RPC patch_property (null = sleutel verwijderen). */
export function patchToRpcArgs(patch: Record<string, unknown>) {
  const columns: Record<string, unknown> = {};
  const facts: Record<string, Record<string, unknown>> = {};
  const positioning: Record<string, unknown> = {};
  const publication: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(patch)) {
    if (raw === undefined) continue;
    const f = FIELD_BY_KEY.get(key);
    if (!f) continue;
    const value = Array.isArray(raw) && raw.length === 0 ? null : raw;
    if (f.column) {
      columns[f.column] = value;
      continue;
    }
    const t = jsonTarget(f);
    if (t.column === "facts_json" && t.group) (facts[t.group] ??= {})[t.name] = value;
    else if (t.column === "positioning_json") positioning[t.name] = value;
    else publication[t.name] = value;
  }
  return {
    p_columns: columns,
    p_facts: Object.keys(facts).length ? facts : null,
    p_positioning: Object.keys(positioning).length ? positioning : null,
    p_publication: Object.keys(publication).length ? publication : null,
  };
}
