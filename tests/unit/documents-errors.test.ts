import { describe, expect, it } from "vitest";
import { detectContent, sanitizeFilename } from "@/lib/documents/validate";
import { AppError, fromDbError, toSafeError } from "@/lib/errors";

const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);

describe("bestandscontrole op werkelijke inhoud", () => {
  it("accepteert een echte PDF en PNG", async () => {
    expect(await detectContent(PDF, "application/pdf")).toEqual({ ok: true, mime: "application/pdf" });
    expect(await detectContent(PNG, "image/png")).toEqual({ ok: true, mime: "image/png" });
  });
  it("weigert een bestand waarvan de inhoud niet bij het type past", async () => {
    expect((await detectContent(PNG, "application/pdf")).ok).toBe(false);
    expect((await detectContent(new TextEncoder().encode("geen pdf"), "application/pdf")).ok).toBe(false);
  });
  it("weigert niet-ondersteunde typen en lege of binaire tekstbestanden", async () => {
    expect((await detectContent(PDF, "application/x-msdownload")).ok).toBe(false);
    expect((await detectContent(new Uint8Array(), "text/plain")).ok).toBe(false);
    expect((await detectContent(new Uint8Array([65, 0, 66]), "text/plain")).ok).toBe(false);
    expect((await detectContent(new TextEncoder().encode("Bouwjaar: 1880 – één"), "text/plain")).ok).toBe(true);
  });
  it("schoont bestandsnamen op", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename('C:\\dossier\\<script>"x".pdf')).toBe("scriptx.pdf");
    expect(sanitizeFilename("   ")).toBe("bestand");
  });
});

describe("veilige foutmeldingen", () => {
  it("vertaalt RLS- en rechtenfouten zonder details", () => {
    const e = fromDbError({ code: "42501", message: 'new row violates row-level security policy for table "properties"' });
    expect(e.code).toBe("geen_toegang");
    expect(e.message).not.toMatch(/properties|policy/);
  });
  it("herkent versieconflicten", () => {
    expect(fromDbError({ code: "40001", message: "Versieconflict: v3" }).code).toBe("versieconflict");
  });
  it("lekt geen interne constraintnamen", () => {
    expect(fromDbError({ code: "23514", message: 'new row for relation "x" violates check constraint "y"' }).message).toBe("De invoer is ongeldig.");
  });
  it("onverwachte fouten worden generiek", () => {
    const s = toSafeError(new Error("ECONNREFUSED 10.0.0.1:5432 password=geheim"));
    expect(s).toMatchObject({ code: "onbekend", status: 500 });
    expect(s.message).not.toMatch(/ECONN|geheim/);
    expect(toSafeError(new AppError("limiet_bereikt", "Te veel")).status).toBe(429);
  });
});
