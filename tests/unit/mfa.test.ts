import { describe, expect, it } from "vitest";
import { isAdminOnlyCapability, mfaDecision, normalizeLevel, normalizeTotpCode, qrCodeDataUrl, type MfaInput } from "@/lib/auth/mfa";
import type { Capability } from "@/lib/auth/permissions";
import { base32Decode, totp } from "../helpers/totp";

const base: MfaInput = { role: "admin", currentLevel: "aal1", hasVerifiedFactor: false };

describe("isAdminOnlyCapability", () => {
  it("herkent precies de rechten die alleen administrators hebben", () => {
    const adminOnly: Capability[] = ["users.manage", "styleguide.edit", "settings.edit", "properties.archive", "properties.purge", "usage.view_all", "audit.view"];
    const shared: Capability[] = ["properties.create", "properties.edit", "documents.upload", "facts.verify", "texts.generate_all", "texts.edit", "texts.regenerate_one", "texts.submit", "texts.approve"];
    for (const c of adminOnly) expect(isAdminOnlyCapability(c), c).toBe(true);
    for (const c of shared) expect(isAdminOnlyCapability(c), c).toBe(false);
  });
});

describe("mfaDecision", () => {
  it("gebruiker met factor en aal1-sessie moet eerst verifiëren, ongeacht rol of pagina", () => {
    for (const role of ["admin", "makelaar", "redacteur"] as const) {
      expect(mfaDecision({ role, currentLevel: "aal1", hasVerifiedFactor: true })).toBe("verificatie_nodig");
      expect(mfaDecision({ role, capability: "texts.edit", currentLevel: "aal1", hasVerifiedFactor: true })).toBe("verificatie_nodig");
    }
    expect(mfaDecision({ role: null, currentLevel: "aal1", hasVerifiedFactor: true })).toBe("verificatie_nodig");
  });

  it("nextLevel aal2 telt als factor (alleen strenger)", () => {
    expect(mfaDecision({ role: "makelaar", currentLevel: "aal1", nextLevel: "aal2", hasVerifiedFactor: false })).toBe("verificatie_nodig");
    expect(mfaDecision({ role: "makelaar", currentLevel: "aal1", nextLevel: "aal1", hasVerifiedFactor: true })).toBe("verificatie_nodig");
  });

  it("ontbrekend niveau geldt als niet geverifieerd", () => {
    expect(mfaDecision({ role: "makelaar", currentLevel: null, hasVerifiedFactor: true })).toBe("verificatie_nodig");
    expect(mfaDecision({ role: "admin", capability: "users.manage", currentLevel: undefined, hasVerifiedFactor: false })).toBe("inschrijving_nodig");
  });

  it("gebruiker met factor en aal2-sessie is toegestaan", () => {
    expect(mfaDecision({ role: "makelaar", currentLevel: "aal2", hasVerifiedFactor: true })).toBe("toegestaan");
    expect(mfaDecision({ ...base, capability: "users.manage", currentLevel: "aal2", hasVerifiedFactor: true })).toBe("toegestaan");
  });

  it("admin zonder factor moet MFA instellen voor admin-only rechten", () => {
    for (const capability of ["users.manage", "settings.edit", "styleguide.edit", "properties.purge", "audit.view"] as Capability[]) {
      expect(mfaDecision({ ...base, capability })).toBe("inschrijving_nodig");
    }
  });

  it("admin zonder factor kan overige pagina's en rechten gewoon gebruiken", () => {
    expect(mfaDecision(base)).toBe("toegestaan");
    for (const capability of ["properties.create", "texts.edit", "texts.approve", "facts.verify"] as Capability[]) {
      expect(mfaDecision({ ...base, capability })).toBe("toegestaan");
    }
  });

  it("admin met factor maar aal1 moet verifiëren (ook voor admin-only rechten)", () => {
    expect(mfaDecision({ ...base, capability: "users.manage", hasVerifiedFactor: true })).toBe("verificatie_nodig");
  });

  it("admin die de factor verwijderde (aal2-sessie, geen factor) moet opnieuw instellen voor beheer", () => {
    expect(mfaDecision({ ...base, capability: "settings.edit", currentLevel: "aal2", hasVerifiedFactor: false })).toBe("inschrijving_nodig");
    expect(mfaDecision({ ...base, capability: "texts.edit", currentLevel: "aal2", hasVerifiedFactor: false })).toBe("toegestaan");
  });

  it("niet-admins zonder factor: MFA niet vereist (rolcontrole gebeurt elders)", () => {
    expect(mfaDecision({ role: "makelaar", currentLevel: "aal1", hasVerifiedFactor: false })).toBe("toegestaan");
    expect(mfaDecision({ role: "redacteur", capability: "users.manage", currentLevel: "aal1", hasVerifiedFactor: false })).toBe("toegestaan");
  });
});

describe("hulpfuncties", () => {
  it("normalizeLevel accepteert alleen aal1/aal2", () => {
    expect(normalizeLevel("aal1")).toBe("aal1");
    expect(normalizeLevel("aal2")).toBe("aal2");
    expect(normalizeLevel("aal3")).toBeNull();
    expect(normalizeLevel(undefined)).toBeNull();
    expect(normalizeLevel(2)).toBeNull();
  });

  it("normalizeTotpCode accepteert 6 cijfers met spaties", () => {
    expect(normalizeTotpCode("123456")).toBe("123456");
    expect(normalizeTotpCode(" 123 456 ")).toBe("123456");
    expect(normalizeTotpCode("12345")).toBeNull();
    expect(normalizeTotpCode("1234567")).toBeNull();
    expect(normalizeTotpCode("12a456")).toBeNull();
    expect(normalizeTotpCode(null)).toBeNull();
  });

  it("qrCodeDataUrl codeert de ruwe SVG van Supabase", () => {
    const url = qrCodeDataUrl('data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"><path fill="#000" d="M0 0"/></svg>');
    expect(url).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    expect(url).not.toMatch(/[<>#"]/);
    expect(qrCodeDataUrl("javascript:alert(1)")).toBeNull();
    expect(qrCodeDataUrl("https://example.test/qr.svg")).toBeNull();
    expect(qrCodeDataUrl("")).toBeNull();
  });
});

describe("TOTP-testhelper (RFC 6238)", () => {
  // RFC 6238 bijlage B, SHA-1, geheim "12345678901234567890".
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  it("base32 decodeert naar de RFC-sleutel", () => {
    expect(base32Decode(secret).toString("ascii")).toBe("12345678901234567890");
  });
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("T=%i geeft %s", (t, expected) => {
    expect(totp(secret, t * 1000, { digits: 8 })).toBe(expected);
    expect(totp(secret, t * 1000)).toBe(expected.slice(-6));
  });
});
