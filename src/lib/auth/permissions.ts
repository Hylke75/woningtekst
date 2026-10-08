/**
 * Rolrechten (opdracht §12). Puur en zonder afhankelijkheden zodat ze in de UI
 * én op de server gebruikt en getest kunnen worden. De database dwingt dezelfde
 * regels af via RLS; deze matrix bepaalt alleen wat de interface toont en wat
 * server-acties vooraf controleren.
 */
export type AppRole = "admin" | "makelaar" | "redacteur";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrator",
  makelaar: "Makelaar",
  redacteur: "Redacteur",
};

export type Capability =
  | "users.manage"
  | "styleguide.edit"
  | "settings.edit"
  | "properties.create"
  | "properties.edit"
  | "properties.archive"
  | "properties.purge"
  | "documents.upload"
  | "facts.verify"
  | "texts.generate_all"
  | "texts.edit"
  | "texts.regenerate_one"
  | "texts.submit"
  | "texts.approve"
  | "usage.view_all"
  | "audit.view";

const MATRIX: Record<AppRole, Capability[]> = {
  admin: [
    "users.manage",
    "styleguide.edit",
    "settings.edit",
    "properties.create",
    "properties.edit",
    "properties.archive",
    "properties.purge",
    "documents.upload",
    "facts.verify",
    "texts.generate_all",
    "texts.edit",
    "texts.regenerate_one",
    "texts.submit",
    "texts.approve",
    "usage.view_all",
    "audit.view",
  ],
  makelaar: [
    "properties.create",
    "properties.edit",
    "documents.upload",
    "facts.verify",
    "texts.generate_all",
    "texts.edit",
    "texts.regenerate_one",
    "texts.submit",
    "texts.approve",
  ],
  redacteur: ["texts.edit", "texts.regenerate_one", "texts.submit"],
};

/** De vaste rechten van een rol volgens de matrix (zonder organisatie-instellingen). */
export function capabilitiesFor(role: AppRole): readonly Capability[] {
  return MATRIX[role];
}

/**
 * @param approvalRoles configureerbaar per organisatie (organization_settings.approval_roles)
 */
export function can(role: AppRole | null | undefined, capability: Capability, approvalRoles?: AppRole[]): boolean {
  if (!role) return false;
  if (capability === "texts.approve" && approvalRoles) {
    return approvalRoles.includes(role);
  }
  return MATRIX[role].includes(capability);
}
