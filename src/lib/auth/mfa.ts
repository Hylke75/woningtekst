/**
 * Beslislogica voor twee-stapsverificatie (TOTP via Supabase Auth MFA).
 * Puur en zonder afhankelijkheden, zodat ze los te testen is. De invoer moet
 * server-side uit vertrouwde bronnen komen: `currentLevel` uit het geverifieerde
 * JWT (getClaims), `hasVerifiedFactor` uit de database/Auth-server.
 *
 * Regels:
 * 1. Heeft de gebruiker een geverifieerde factor maar is de sessie nog aal1,
 *    dan moet eerst de code worden ingevoerd (geldt voor iedere rol en pagina).
 * 2. Administrators gebruiken admin-only rechten (zie `isAdminOnlyCapability`)
 *    alleen met een geverifieerde factor én een aal2-sessie; zonder factor
 *    moeten ze die eerst instellen. Overige rechten blijven zonder MFA werken.
 */
import { capabilitiesFor, type AppRole, type Capability } from "@/lib/auth/permissions";

export type AssuranceLevel = "aal1" | "aal2";
export type MfaDecision = "toegestaan" | "verificatie_nodig" | "inschrijving_nodig";

export type MfaInput = {
  role: AppRole | null | undefined;
  capability?: Capability;
  /** Niveau van de huidige sessie, uit het geverifieerde JWT (`aal`-claim). */
  currentLevel: AssuranceLevel | null | undefined;
  /** Hoogst haalbare niveau (Supabase `nextLevel`): aal2 zodra er een geverifieerde factor is. */
  nextLevel?: AssuranceLevel | null;
  /** Of de gebruiker een geverifieerde factor heeft (gezaghebbende bron). */
  hasVerifiedFactor: boolean;
};

const NON_ADMIN_ROLES: AppRole[] = ["makelaar", "redacteur"];

/** Rechten die volgens de rolmatrix uitsluitend administrators hebben. */
export function isAdminOnlyCapability(capability: Capability): boolean {
  return capabilitiesFor("admin").includes(capability) && !NON_ADMIN_ROLES.some((r) => capabilitiesFor(r).includes(capability));
}

export function normalizeLevel(value: unknown): AssuranceLevel | null {
  return value === "aal1" || value === "aal2" ? value : null;
}

export function mfaDecision(input: MfaInput): MfaDecision {
  const hasFactor = input.hasVerifiedFactor || input.nextLevel === "aal2";
  const verified = input.currentLevel === "aal2";

  if (hasFactor && !verified) return "verificatie_nodig";

  if (input.role === "admin" && input.capability && isAdminOnlyCapability(input.capability)) {
    if (!hasFactor) return "inschrijving_nodig";
    if (!verified) return "verificatie_nodig";
  }
  return "toegestaan";
}

export const MFA_MESSAGES = {
  verificatie_nodig: "Bevestig eerst uw inlog met de code uit uw authenticator-app.",
  inschrijving_nodig: "Stel twee-stapsverificatie in om beheerfuncties te gebruiken.",
} as const;

/** Haalt de 6-cijferige code uit invoer met eventuele spaties; null als ongeldig. */
export function normalizeTotpCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

/**
 * Supabase levert de QR-code als `data:image/svg+xml;utf-8,<svg …>` met ruwe
 * SVG. Zet die om naar een correct gecodeerde data-URL (CSP: img-src data:).
 */
export function qrCodeDataUrl(raw: string): string | null {
  if (!raw) return null;
  const prefix = /^data:image\/svg\+xml;(?:utf-8|charset=utf-8),/i;
  if (prefix.test(raw)) {
    const svg = raw.replace(prefix, "");
    if (/^%3Csvg/i.test(svg)) return `data:image/svg+xml;charset=utf-8,${svg}`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  if (/^data:image\/(?:svg\+xml|png);base64,[A-Za-z0-9+/=]+$/.test(raw)) return raw;
  if (raw.trimStart().startsWith("<svg")) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(raw)}`;
  return null;
}
