import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { SERVER_SECRET, asUser, createTestDatabase, createUser, type TestUser } from "./db-harness";

/**
 * Verplichte security- en RLS-tests (opdracht §13). Draaien tegen een echte
 * PostgreSQL-database met de productie-migraties.
 */

let db: pg.Client;
let orgA: string;
let orgB: string;
let adminA: TestUser;
let makelaarA: TestUser;
let redacteurA: TestUser;
let adminB: TestUser;
let outsider: TestUser;
let propertyA: string;
let propertyB: string;
let contentA: string;
let documentA: string;
let documentB: string;

const SHA = "a".repeat(64);

async function invite(org: string, email: string, role: string) {
  await db.query("insert into public.invitations (organization_id, email, role) values ($1, $2, $3)", [org, email, role]);
}

beforeAll(async () => {
  db = await createTestDatabase("wt_rls_test");
  orgA = (await db.query("select private.bootstrap_organization('Kantoor A', 'admin-a@example.test') as id")).rows[0].id;
  orgB = (await db.query("select private.bootstrap_organization('Kantoor B', 'admin-b@example.test') as id")).rows[0].id;
  await invite(orgA, "makelaar-a@example.test", "makelaar");
  await invite(orgA, "redacteur-a@example.test", "redacteur");

  adminA = await createUser(db, "admin-a@example.test");
  makelaarA = await createUser(db, "makelaar-a@example.test");
  redacteurA = await createUser(db, "redacteur-a@example.test");
  adminB = await createUser(db, "admin-b@example.test");
  outsider = await createUser(db, "outsider@example.test");

  propertyA = await asUser(db, makelaarA, async ({ q }) =>
    (await q(
      "insert into public.properties (organization_id, address, house_number, city, property_type) values ($1, 'Teststraat', '1', 'Den Haag', 'Herenhuis') returning id",
      [orgA],
    )).rows[0].id,
  { commit: true });
  propertyB = await asUser(db, adminB, async ({ q }) =>
    (await q(
      "insert into public.properties (organization_id, address, house_number, city, property_type) values ($1, 'Anderestraat', '2', 'Leiden', 'Appartement') returning id",
      [orgB],
    )).rows[0].id,
  { commit: true });

  contentA = await asUser(db, makelaarA, async ({ q }) =>
    (await q(
      "select id from public.save_content_version($1, 'funda', 'nl', '<p>Tekst A</p>', 'handmatig', 0)",
      [propertyA],
    )).rows[0].id,
  { commit: true });

  documentA = await asUser(db, makelaarA, async ({ q }) => {
    const path = `${orgA}/${propertyA}/${randomUUID()}.pdf`;
    await q("insert into storage.objects (bucket_id, name) values ('property-documents', $1)", [path]);
    return (await q(
      "insert into public.property_documents (property_id, organization_id, storage_path, filename, mime_type, file_size, sha256) values ($1, $2, $3, 'dossier.pdf', 'application/pdf', 1000, $4) returning id",
      [propertyA, orgA, path, SHA],
    )).rows[0].id;
  }, { commit: true });
  documentB = await asUser(db, adminB, async ({ q }) => {
    const path = `${orgB}/${propertyB}/${randomUUID()}.pdf`;
    await q("insert into storage.objects (bucket_id, name) values ('property-documents', $1)", [path]);
    return (await q(
      "insert into public.property_documents (property_id, organization_id, storage_path, filename, mime_type, file_size, sha256) values ($1, $2, $3, 'b.pdf', 'application/pdf', 1000, $4) returning id",
      [propertyB, orgB, path, SHA],
    )).rows[0].id;
  }, { commit: true });
});

afterAll(async () => {
  await db?.end();
});

describe("lidmaatschap via uitnodiging", () => {
  it("koppelt bevestigde gebruikers met uitnodiging aan de juiste organisatie en rol", async () => {
    const { rows } = await db.query(
      "select user_id, organization_id, role from public.organization_memberships order by role",
    );
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.user_id === redacteurA.id)?.role).toBe("redacteur");
    expect(rows.find((r) => r.user_id === adminB.id)?.organization_id).toBe(orgB);
  });

  it("geeft een gebruiker zonder uitnodiging geen enkele toegang", async () => {
    const rows = await asUser(db, outsider, async ({ q }) => (await q("select id from public.properties")).rows);
    expect(rows).toHaveLength(0);
  });

  it("accepteert geen uitnodiging voor een onbevestigd e-mailadres", async () => {
    await invite(orgA, "onbevestigd@example.test", "makelaar");
    const u = await createUser(db, "onbevestigd@example.test", { confirmed: false });
    const { rows } = await db.query("select 1 from public.organization_memberships where user_id = $1", [u.id]);
    expect(rows).toHaveLength(0);
  });
});

describe("organisatie-isolatie", () => {
  it("gebruiker A kan geen woning van organisatie B ophalen", async () => {
    const rows = await asUser(db, adminA, async ({ q }) =>
      (await q("select id from public.properties where id = $1", [propertyB])).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it("een vervalste property_id geeft geen toegang tot gekoppelde gegevens", async () => {
    await asUser(db, adminA, async ({ q }) => {
      for (const table of ["property_documents", "property_facts", "content_versions", "review_issues", "generation_jobs"]) {
        const { rows } = await q(`select * from public.${table} where property_id = $1`, [propertyB]);
        expect(rows, table).toHaveLength(0);
      }
      const { rows } = await q("select * from public.property_overview where id = $1", [propertyB]);
      expect(rows).toHaveLength(0);
    });
  });

  it("gebruiker A kan geen tekst van B wijzigen of aanvullen", async () => {
    await asUser(db, adminA, async ({ deny, q }) => {
      await deny(
        "select public.save_content_version($1, 'funda', 'nl', 'kaping', 'handmatig', null)",
        [propertyB],
      );
      await deny(
        "insert into public.content_versions (property_id, organization_id, channel, language, version_number, content, source) values ($1, $2, 'funda', 'nl', 99, 'x', 'handmatig')",
        [propertyB, orgB],
      );
      // Eigen organization_id met andermans woning: samengestelde FK weigert
      await deny(
        "insert into public.content_versions (property_id, organization_id, channel, language, version_number, content, source) values ($1, $2, 'funda', 'nl', 99, 'x', 'handmatig')",
        [propertyB, orgA],
      );
      const upd = await q("update public.properties set address = 'gekaapt' where id = $1", [propertyB]).catch((e) => e);
      expect(upd instanceof Error || upd.rowCount === 0).toBe(true);
    });
  });

  it("isoleert bronbestanden, tekstversies, verbruik en logs", async () => {
    await asUser(db, adminA, async ({ q }) => {
      expect((await q("select id from public.property_documents where id = $1", [documentB])).rows).toHaveLength(0);
      const logs = (await q("select organization_id from public.audit_logs")).rows;
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every((l) => l.organization_id === orgA)).toBe(true);
      const usage = (await q("select organization_id from public.ai_usage_events")).rows;
      expect(usage.every((u) => u.organization_id === orgA)).toBe(true);
      const profiles = (await q("select id from public.profiles")).rows.map((r) => r.id);
      expect(profiles).not.toContain(adminB.id);
    });
  });

  it("anon heeft nergens toegang toe", async () => {
    await asUser(db, null, async ({ deny }) => {
      await deny("select * from public.properties");
      await deny("select * from public.content_versions");
      await deny("select public.server_ai_reserve('x', 'a', 'b', null, null)");
    });
  });
});

describe("mass assignment", () => {
  it("organization_id en created_by van een woning zijn niet te wijzigen", async () => {
    await asUser(db, adminA, async ({ q }) => {
      await q("update public.properties set organization_id = $1, created_by = $2 where id = $3", [orgB, adminB.id, propertyA]);
      const { rows } = await q("select organization_id, created_by from public.properties where id = $1", [propertyA]);
      expect(rows[0].organization_id).toBe(orgA);
      expect(rows[0].created_by).toBe(makelaarA.id);
    });
  });

  it("een woning kan niet in een andere organisatie worden aangemaakt", async () => {
    await asUser(db, adminA, async ({ deny }) => {
      const msg = await deny(
        "insert into public.properties (organization_id, address) values ($1, 'x')",
        [orgB],
      );
      expect(msg).toMatch(/row-level security|hoort niet bij deze organisatie/);
    });
    // Ook met expliciete, geldige verantwoordelijke weigert RLS de insert
    await asUser(db, adminA, async ({ deny }) => {
      const msg = await deny(
        "insert into public.properties (organization_id, address, assigned_to) values ($1, 'x', $2)",
        [orgB, adminB.id],
      );
      expect(msg).toMatch(/row-level security/);
    });
  });

  it("een verantwoordelijke uit een andere organisatie kan niet worden toegewezen", async () => {
    await asUser(db, adminA, async ({ deny }) => {
      await deny("update public.properties set assigned_to = $1 where id = $2", [adminB.id, propertyA]);
    });
  });

  it("server-velden van een generatiejob zijn niet te vervalsen bij aanmaken", async () => {
    await asUser(db, makelaarA, async ({ q }) => {
      const { rows } = await q(
        "insert into public.generation_jobs (property_id, organization_id, requested_by, job_type, idempotency_key, input_hash, status, estimated_cost, attempt_count) values ($1, $2, $3, 'volledige_generatie', 'idem-key-001', 'hash', 'voltooid', -5, 99) returning status, estimated_cost, attempt_count, requested_by",
        [propertyA, orgA, makelaarA.id],
      );
      expect(rows[0]).toMatchObject({ status: "wachtrij", attempt_count: 0, requested_by: makelaarA.id });
      expect(Number(rows[0].estimated_cost)).toBe(0);
    });
  });
});

describe("rollen", () => {
  it("redacteur kan geen administratoracties uitvoeren", async () => {
    await asUser(db, redacteurA, async ({ deny, q }) => {
      const upd = await q("update public.organization_settings set ai_daily_cost_limit_eur = 100000");
      expect(upd.rowCount).toBe(0);
      await deny("select public.publish_style_guide('x', repeat('a', 100), 'poging', true)");
      await deny("select public.admin_create_invitation('nieuw@example.test', 'admin')");
      await deny("select public.admin_update_member($1, 'redacteur', false)", [adminA.id]);
      await deny("select public.purge_property($1)", [propertyA]);
      await deny("insert into public.properties (organization_id, address) values ($1, 'x')", [orgA]);
    });
    // Organisatie-instellingen ongewijzigd (update zonder policy raakt 0 rijen)
    const { rows } = await db.query("select ai_daily_cost_limit_eur from public.organization_settings where organization_id = $1", [orgA]);
    expect(Number(rows[0].ai_daily_cost_limit_eur)).toBe(25);
  });

  it("redacteur kan teksten schrijven en ter goedkeuring aanbieden, maar niet goedkeuren", async () => {
    await asUser(db, redacteurA, async ({ q, deny }) => {
      const v = (await q(
        "select * from public.save_content_version($1, 'instagram', 'nl', 'Nieuwe tekst', 'handmatig', 0)",
        [propertyA],
      )).rows[0];
      expect(v.edited_by).toBe(redacteurA.id);
      const submitted = (await q("select * from public.set_content_status($1, 'ter_controle')", [v.id])).rows[0];
      expect(submitted.submitted_by).toBe(redacteurA.id);
      const msg = await deny("select public.set_content_status($1, 'goedgekeurd')", [v.id]);
      expect(msg).toMatch(/goedkeuringsrechten/);
    });
  });

  it("redacteur kan geen volledige generatie starten (geen AI-kosten zonder bevoegdheid)", async () => {
    await asUser(db, redacteurA, async ({ deny }) => {
      await deny(
        "insert into public.generation_jobs (property_id, organization_id, requested_by, job_type, idempotency_key, input_hash) values ($1, $2, $3, 'volledige_generatie', 'idem-redacteur', 'h')",
        [propertyA, orgA, redacteurA.id],
      );
    });
  });

  it("admin kan zichzelf niet degraderen en de laatste admin blijft behouden", async () => {
    await asUser(db, adminA, async ({ deny }) => {
      await deny("select public.admin_update_member($1, 'redacteur', true)", [adminA.id]);
    });
  });
});

describe("goedkeuring", () => {
  it("een browserrequest kan geen goedkeuring van een andere medewerker vervalsen", async () => {
    await asUser(db, redacteurA, async ({ q }) => {
      const { rows } = await q(
        "insert into public.content_versions (property_id, organization_id, channel, language, version_number, content, source, status, approved_by, approved_at, edited_by) values ($1, $2, 'facebook', 'nl', 1, 'x', 'handmatig', 'goedgekeurd', $3, now(), $3) returning status, approved_by, edited_by",
        [propertyA, orgA, adminA.id],
      );
      expect(rows[0]).toMatchObject({ status: "concept", approved_by: null, edited_by: redacteurA.id });
    });
  });

  it("goedkeuring registreert altijd de ingelogde goedkeurder", async () => {
    await asUser(db, makelaarA, async ({ q }) => {
      const { rows } = await q("select * from public.set_content_status($1, 'goedgekeurd')", [contentA]);
      expect(rows[0].approved_by).toBe(makelaarA.id);
      expect(rows[0].status).toBe("goedgekeurd");
    });
  });

  it("tekstversies zijn onveranderlijk", async () => {
    await asUser(db, adminA, async ({ deny }) => {
      await deny("update public.content_versions set content = 'overschreven' where id = $1", [contentA]);
      await deny("delete from public.content_versions where id = $1", [contentA]);
    });
  });

  it("gelijktijdige bewerkingen leveren een versieconflict op in plaats van stil overschrijven", async () => {
    await asUser(db, makelaarA, async ({ deny }) => {
      const msg = await deny(
        "select public.save_content_version($1, 'funda', 'nl', 'oude basis', 'handmatig', 0)",
        [propertyA],
      );
      expect(msg).toMatch(/Versieconflict/);
    });
  });

  it("een wijziging in één tekst laat andere teksten ongemoeid", async () => {
    await asUser(db, makelaarA, async ({ q }) => {
      await q("select public.save_content_version($1, 'website', 'en', 'English', 'handmatig', 0)", [propertyA]);
      const { rows } = await q(
        "select channel, language, max(version_number) v from public.content_versions where property_id = $1 group by 1, 2",
        [propertyA],
      );
      const funda = rows.find((r) => r.channel === "funda" && r.language === "nl");
      expect(funda.v).toBe(1);
    });
  });
});

describe("bronfeiten", () => {
  it("AI-feiten kunnen niet als bevestigd worden ingevoerd en bevestiging registreert de mens", async () => {
    await asUser(db, makelaarA, async ({ q }) => {
      const ins = (await q(
        "insert into public.property_facts (property_id, organization_id, field_name, field_value, source_type, source_document_id, verification_status, verified_by, verified_at) values ($1, $2, 'year_built', '1880', 'document', $3, 'bevestigd', $4, now()) returning *",
        [propertyA, orgA, documentA, adminA.id],
      )).rows[0];
      expect(ins.verification_status).toBe("onbevestigd");
      expect(ins.verified_by).toBeNull();
      const upd = (await q(
        "update public.property_facts set verification_status = 'bevestigd', verified_by = $2, field_value = '1725' where id = $1 returning *",
        [ins.id, adminA.id],
      )).rows[0];
      expect(upd.verified_by).toBe(makelaarA.id);
      expect(upd.field_value).toBe("1880");
    });
  });
});

describe("opslag", () => {
  it("objecten van een andere organisatie zijn niet zichtbaar of op te vragen via geraden paden", async () => {
    await asUser(db, adminA, async ({ q, deny }) => {
      const { rows } = await q("select name from storage.objects");
      expect(rows.every((r) => r.name.startsWith(orgA))).toBe(true);
      expect((await q("select name from storage.objects where name like $1", [`${orgB}%`])).rows).toHaveLength(0);
      await deny("insert into storage.objects (bucket_id, name) values ('property-documents', $1)", [`${orgB}/${propertyB}/x.pdf`]);
      // Pad met woning uit andere organisatie onder eigen organisatiemap
      await deny("insert into storage.objects (bucket_id, name) values ('property-documents', $1)", [`${orgA}/${propertyB}/x.pdf`]);
      await deny("insert into storage.objects (bucket_id, name) values ('property-documents', $1)", [`${orgA}/../${orgB}/x.pdf`]);
    });
  });

  it("redacteur kan bestanden bekijken maar niet uploaden of verwijderen", async () => {
    await asUser(db, redacteurA, async ({ q, deny }) => {
      expect((await q("select name from storage.objects")).rows.length).toBeGreaterThan(0);
      await deny("insert into storage.objects (bucket_id, name) values ('property-documents', $1)", [`${orgA}/${propertyA}/r.pdf`]);
      const del = await q("delete from storage.objects where bucket_id = 'property-documents'");
      expect(del.rowCount).toBe(0);
    });
  });

  it("documentpad moet binnen organisatie- en woningmap vallen", async () => {
    await asUser(db, makelaarA, async ({ deny }) => {
      await deny(
        "insert into public.property_documents (property_id, organization_id, storage_path, filename, mime_type, file_size, sha256) values ($1, $2, $3, 'x.pdf', 'application/pdf', 10, $4)",
        [propertyA, orgA, `${orgB}/${propertyB}/x.pdf`, "b".repeat(64)],
      );
      await deny(
        "insert into public.property_documents (property_id, organization_id, storage_path, filename, mime_type, file_size, sha256) values ($1, $2, $3, 'x.exe', 'application/x-msdownload', 10, $4)",
        [propertyA, orgA, `${orgA}/${propertyA}/x.exe`, "c".repeat(64)],
      );
    });
  });
});

describe("AI-kosten en quota", () => {
  it("zonder servergeheim kan niemand verbruik registreren of jobs bijwerken", async () => {
    await asUser(db, adminA, async ({ deny }) => {
      await deny("select public.server_ai_reserve('fout-geheim-dat-lang-genoeg-is-1234567890', 'x', 'm', null, null)");
      await deny("select public.server_ai_finish(null, gen_random_uuid(), 'succes', 1, 1, 0, 0, null, 1)");
      await deny("select public.server_job_update('kort', gen_random_uuid(), 'voltooid', null, null, null, null)");
      await deny("insert into public.ai_usage_events (organization_id, operation, model, status) values ($1, 'x', 'm', 'succes')", [orgA]);
    });
  });

  it("gebruiker zonder organisatie krijgt geen AI-reservering", async () => {
    const res = await asUser(db, outsider, async ({ q }) =>
      (await q("select public.server_ai_reserve($1, 'test', 'model', null, null) r", [SERVER_SECRET])).rows[0].r,
    );
    expect(res.allowed).toBe(false);
  });

  it("reservering voor een woning van een andere organisatie wordt geweigerd", async () => {
    const res = await asUser(db, adminA, async ({ q }) =>
      (await q("select public.server_ai_reserve($1, 'test', 'model', $2, null) r", [SERVER_SECRET, propertyB])).rows[0].r,
    );
    expect(res).toMatchObject({ allowed: false, reason: "geen_toegang" });
  });

  it("dwingt de rate limit per minuut af", async () => {
    await asUser(db, adminA, async ({ q }) => {
      const results = [];
      for (let i = 0; i < 14; i++) {
        results.push((await q("select public.server_ai_reserve($1, 'test', 'model', $2, null) r", [SERVER_SECRET, propertyA])).rows[0].r);
      }
      expect(results.filter((r) => r.allowed)).toHaveLength(12);
      expect(results.at(-1)).toMatchObject({ allowed: false, reason: "te_veel_verzoeken_per_minuut" });
    });
  });

  it("dwingt de daglimiet op kosten af en registreert verbruik op de job", async () => {
    await asUser(db, makelaarA, async ({ q }) => {
      const job = (await q(
        "insert into public.generation_jobs (property_id, organization_id, requested_by, job_type, idempotency_key, input_hash) values ($1, $2, $3, 'volledige_generatie', 'idem-kosten', 'h') returning id",
        [propertyA, orgA, makelaarA.id],
      )).rows[0].id;
      const r1 = (await q("select public.server_ai_reserve($1, 'gen', 'claude', $2, $3) r", [SERVER_SECRET, propertyA, job])).rows[0].r;
      expect(r1.allowed).toBe(true);
      await q("select public.server_ai_finish($1, $2, 'succes', 1000, 500, 0, 30, null, 1200)", [SERVER_SECRET, r1.event_id]);
      const jobRow = (await q("select token_usage, estimated_cost from public.generation_jobs where id = $1", [job])).rows[0];
      expect(jobRow.token_usage).toEqual({ input_tokens: 1000, output_tokens: 500 });
      expect(Number(jobRow.estimated_cost)).toBe(30);
      const r2 = (await q("select public.server_ai_reserve($1, 'gen', 'claude', $2, $3) r", [SERVER_SECRET, propertyA, job])).rows[0].r;
      expect(r2).toMatchObject({ allowed: false, reason: "daglimiet_kosten" });
    });
  });

  it("een job kan maar door één request tegelijk worden geclaimd", async () => {
    await asUser(db, makelaarA, async ({ q }) => {
      const job = (await q(
        "insert into public.generation_jobs (property_id, organization_id, requested_by, job_type, idempotency_key, input_hash) values ($1, $2, $3, 'volledige_generatie', 'idem-claim', 'h') returning id",
        [propertyA, orgA, makelaarA.id],
      )).rows[0].id;
      const first = (await q("select (public.server_job_claim($1, $2)).id", [SERVER_SECRET, job])).rows[0].id;
      const second = (await q("select (public.server_job_claim($1, $2)).id", [SERVER_SECRET, job])).rows[0].id;
      expect(first).toBe(job);
      expect(second).toBeNull();
    });
  });

  it("idempotency: dezelfde sleutel levert geen tweede job op", async () => {
    await asUser(db, makelaarA, async ({ q, deny }) => {
      await q(
        "insert into public.generation_jobs (property_id, organization_id, requested_by, job_type, idempotency_key, input_hash) values ($1, $2, $3, 'tekstcontrole', 'idem-dubbel', 'h')",
        [propertyA, orgA, makelaarA.id],
      );
      await deny(
        "insert into public.generation_jobs (property_id, organization_id, requested_by, job_type, idempotency_key, input_hash) values ($1, $2, $3, 'tekstcontrole', 'idem-dubbel', 'h')",
        [propertyA, orgA, makelaarA.id],
      );
    });
  });
});

describe("schrijfwijzer en audit", () => {
  it("admin publiceert een nieuwe versie; oude versies blijven onveranderd", async () => {
    await asUser(db, adminA, async ({ q, deny }) => {
      const v1 = (await q("select * from public.publish_style_guide('Schrijfwijzer', repeat('regel ', 20), 'eerste', true)")).rows[0];
      const v2 = (await q("select * from public.publish_style_guide('Schrijfwijzer', repeat('nieuw ', 20), 'tweede', true)")).rows[0];
      expect(v2.version).toBe(v1.version + 1);
      const active = (await q("select version from public.style_guides where is_active")).rows;
      expect(active).toEqual([{ version: v2.version }]);
      await deny("update public.style_guides set content = 'x' where id = $1", [v1.id]);
    });
  });

  it("belangrijke acties worden gelogd en het auditlog is niet te wijzigen", async () => {
    await asUser(db, adminA, async ({ q, deny }) => {
      const actions = (await q("select distinct entity_type from public.audit_logs")).rows.map((r) => r.entity_type);
      expect(actions).toEqual(expect.arrayContaining(["property", "content_version", "property_document", "membership"]));
      await deny("delete from public.audit_logs");
      await deny("update public.audit_logs set action = 'x'");
      await deny("insert into public.audit_logs (action, entity_type) values ('x', 'y')");
    });
  });

  it("niet-admins zien het auditlog niet", async () => {
    const rows = await asUser(db, makelaarA, async ({ q }) => (await q("select * from public.audit_logs")).rows);
    expect(rows).toHaveLength(0);
  });
});

describe("dossier verwijderen (AVG)", () => {
  it("alleen admin kan definitief verwijderen, pas na verwijderen van documenten", async () => {
    await asUser(db, makelaarA, async ({ deny }) => {
      await deny("select public.purge_property($1)", [propertyA]);
    });
    await asUser(db, adminA, async ({ q, deny }) => {
      await deny("select public.purge_property($1)", [propertyA]);
      await q("delete from public.property_documents where property_id = $1", [propertyA]);
      await q("select public.purge_property($1)", [propertyA]);
      expect((await q("select 1 from public.content_versions where property_id = $1", [propertyA])).rows).toHaveLength(0);
      expect((await q("select 1 from public.audit_logs where action = 'purge' and entity_id = $1", [propertyA])).rows).toHaveLength(1);
    });
  });
});

describe("autosave (patch_property)", () => {
  it("voegt JSON-velden per sleutel samen en laat andere velden intact", async () => {
    await asUser(db, adminB, async ({ q }) => {
      await q("select public.patch_property($1, $2, $3, null, null)", [
        propertyB,
        JSON.stringify({ year_built: 1905 }),
        JSON.stringify({ kenmerken: { keuken: "Open keuken", woonkamer: "Ruim" } }),
      ]);
      await q("select public.patch_property($1, $2, $3, null, null)", [
        propertyB,
        JSON.stringify({}),
        JSON.stringify({ kenmerken: { keuken: null, isolatie: "Dakisolatie" } }),
      ]);
      const { rows } = await q("select year_built, facts_json, address from public.properties where id = $1", [propertyB]);
      expect(rows[0].year_built).toBe(1905);
      expect(rows[0].address).toBe("Anderestraat");
      expect(rows[0].facts_json).toEqual({ kenmerken: { woonkamer: "Ruim", isolatie: "Dakisolatie" } });
    });
  });

  it("negeert niet-gewhiteliste kolommen zoals organization_id", async () => {
    await asUser(db, adminB, async ({ q }) => {
      await q("select public.patch_property($1, $2)", [propertyB, JSON.stringify({ organization_id: orgA, created_by: adminA.id })]);
      const { rows } = await q("select organization_id, created_by from public.properties where id = $1", [propertyB]);
      expect(rows[0]).toEqual({ organization_id: orgB, created_by: adminB.id });
    });
  });

  it("weigert patches op woningen van een andere organisatie", async () => {
    await asUser(db, adminA, async ({ deny }) => {
      await deny("select public.patch_property($1, $2)", [propertyB, JSON.stringify({ address: "x" })]);
    });
  });

  it("controlemarkering registreert de ingelogde gebruiker en vervalt bij wijziging", async () => {
    await asUser(db, adminB, async ({ q }) => {
      await q("select public.mark_property_checked($1, true)", [propertyB]);
      let row = (await q("select data_checked_at, data_checked_by from public.properties where id = $1", [propertyB])).rows[0];
      expect(row.data_checked_by).toBe(adminB.id);
      await q("select public.patch_property($1, $2)", [propertyB, JSON.stringify({ rooms: 5 })]);
      row = (await q("select data_checked_at, data_checked_by from public.properties where id = $1", [propertyB])).rows[0];
      expect(row.data_checked_at).toBeNull();
    });
  });
});

describe("accountverwijdering (AVG)", () => {
  it("een medewerker kan worden verwijderd zonder teksten, feiten of documenten te verliezen", async () => {
    const tmp = await createUser(db, "tijdelijk@example.test");
    await db.query("insert into public.organization_memberships (organization_id, user_id, role) values ($1, $2, 'makelaar')", [orgB, tmp.id]);
    const ids = await asUser(db, tmp, async ({ q }) => {
      const p = (await q("insert into public.properties (organization_id, address) values ($1, 'Vertrekstraat') returning id", [orgB])).rows[0].id;
      const v = (await q("select id from public.save_content_version($1, 'funda', 'nl', '<p>x</p>', 'handmatig', 0)", [p])).rows[0].id;
      await q("select public.set_content_status($1, 'goedgekeurd')", [v]);
      const path = `${orgB}/${p}/${randomUUID()}.txt`;
      await q("insert into storage.objects (bucket_id, name) values ('property-documents', $1)", [path]);
      const d = (await q("insert into public.property_documents (property_id, organization_id, storage_path, filename, mime_type, file_size, sha256) values ($1, $2, $3, 'a.txt', 'text/plain', 1, $4) returning id", [p, orgB, path, "d".repeat(64)])).rows[0].id;
      const f = (await q("insert into public.property_facts (property_id, organization_id, field_name, field_value, source_type, verification_status) values ($1, $2, 'rooms', '4', 'handmatig', 'bevestigd') returning id", [p, orgB])).rows[0].id;
      return { p, v, d, f };
    }, { commit: true });

    await db.query("delete from auth.users where id = $1", [tmp.id]);

    const v = (await db.query("select status, approved_by, approved_at, edited_by from public.content_versions where id = $1", [ids.v])).rows[0];
    expect(v).toMatchObject({ status: "goedgekeurd", approved_by: null, edited_by: null });
    expect(v.approved_at).not.toBeNull();
    expect((await db.query("select uploaded_by from public.property_documents where id = $1", [ids.d])).rows[0].uploaded_by).toBeNull();
    expect((await db.query("select verification_status, verified_by from public.property_facts where id = $1", [ids.f])).rows[0]).toEqual({ verification_status: "bevestigd", verified_by: null });
    expect((await db.query("select created_by from public.properties where id = $1", [ids.p])).rows[0].created_by).toBeNull();
  });
});

describe("toegang op e-maildomein", () => {
  it("alleen een admin kan een domein koppelen; publieke maildomeinen worden geweigerd", async () => {
    await asUser(db, redacteurA, async ({ deny }) => {
      await deny("select public.admin_set_email_domain('kantoor-a.test', 'redacteur')");
    });
    await asUser(db, adminA, async ({ deny }) => {
      expect(await deny("select public.admin_set_email_domain('gmail.com', 'redacteur')")).toMatch(/publiek maildomein/);
      expect(await deny("select public.admin_set_email_domain('geen domein', 'redacteur')")).toMatch(/Ongeldig domein/);
    });
    await asUser(db, adminA, async ({ q }) => {
      const row = (await q("select * from public.admin_set_email_domain('@Kantoor-A.test', 'makelaar')")).rows[0];
      expect(row.domain).toBe("kantoor-a.test");
      expect(row.organization_id).toBe(orgA);
    }, { commit: true });
  });

  it("een domein van een andere organisatie kan niet worden overgenomen en is voor hen onzichtbaar", async () => {
    await asUser(db, adminB, async ({ deny, q }) => {
      expect(await deny("select public.admin_set_email_domain('kantoor-a.test', 'admin')")).toMatch(/andere organisatie/);
      expect((await q("select * from public.organization_email_domains")).rows).toHaveLength(0);
      await q("select public.admin_remove_email_domain('kantoor-a.test')");
    }, { commit: true });
    const { rows } = await db.query("select default_role from public.organization_email_domains where domain = 'kantoor-a.test'");
    expect(rows[0]?.default_role).toBe("makelaar");
  });

  it("koppelt pas na bevestiging van het e-mailadres, met de standaardrol van het domein", async () => {
    const u = await createUser(db, "nieuw@kantoor-a.test", { confirmed: false });
    expect((await db.query("select 1 from public.organization_memberships where user_id = $1", [u.id])).rows).toHaveLength(0);
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [u.id]);
    const { rows } = await db.query("select organization_id, role from public.organization_memberships where user_id = $1", [u.id]);
    expect(rows[0]).toEqual({ organization_id: orgA, role: "makelaar" });
  });

  it("een persoonlijke uitnodiging gaat voor de domeinregel", async () => {
    await invite(orgA, "chef@kantoor-a.test", "admin");
    const u = await createUser(db, "chef@kantoor-a.test");
    const { rows } = await db.query("select role from public.organization_memberships where user_id = $1", [u.id]);
    expect(rows[0]?.role).toBe("admin");
  });

  it("geeft andere domeinen (ook subdomeinen) geen toegang en koppelt bestaande accounts bij toevoegen", async () => {
    const sub = await createUser(db, "x@sub.kantoor-a.test");
    const later = await createUser(db, "y@later-a.test");
    expect((await db.query("select 1 from public.organization_memberships where user_id = any($1)", [[sub.id, later.id]])).rows).toHaveLength(0);
    await asUser(db, adminA, async ({ q }) => {
      await q("select public.admin_set_email_domain('later-a.test', 'redacteur')");
    }, { commit: true });
    const { rows } = await db.query("select role from public.organization_memberships where user_id = $1", [later.id]);
    expect(rows[0]?.role).toBe("redacteur");
  });

  it("na verwijderen van het domein krijgen nieuwe accounts geen toegang meer", async () => {
    await asUser(db, adminA, async ({ q }) => {
      await q("select public.admin_remove_email_domain('later-a.test')");
    }, { commit: true });
    const u = await createUser(db, "z@later-a.test");
    expect((await db.query("select 1 from public.organization_memberships where user_id = $1", [u.id])).rows).toHaveLength(0);
  });
});

describe("aanwezigheid, dashboard en samenvatting", () => {
  it("toont wie dezelfde woning bewerkt, maar niet aan andere organisaties", async () => {
    await asUser(db, makelaarA, async ({ q }) => {
      await q("select * from public.touch_presence($1, 'funda:nl')", [propertyA]);
    }, { commit: true });
    const others = await asUser(db, redacteurA, async ({ q }) => (await q("select * from public.touch_presence($1, 'website:nl')", [propertyA])).rows);
    expect(others.map((r) => r.user_id)).toContain(makelaarA.id);
    expect(others.find((r) => r.user_id === makelaarA.id)?.slot).toBe("funda:nl");
    await asUser(db, adminB, async ({ deny, q }) => {
      await deny("select * from public.touch_presence($1, 'funda:nl')", [propertyA]);
      expect((await q("select * from public.property_presence")).rows).toHaveLength(0);
    });
  });

  it("dashboardcijfers volgen RLS en lekken niets van een andere organisatie", async () => {
    const a = await asUser(db, adminA, async ({ q }) => (await q("select public.dashboard_stats(30) as s")).rows[0].s);
    const b = await asUser(db, adminB, async ({ q }) => (await q("select public.dashboard_stats(30) as s")).rows[0].s);
    expect(a.budget.dag_eur).toBeDefined();
    const expectedB = Number((await db.query("select count(*) from public.properties where organization_id = $1 and deleted_at is null", [orgB])).rows[0].count);
    expect(Object.values(b.woningen_per_status as Record<string, number>).reduce((x, y) => x + y, 0)).toBe(expectedB);
    const none = await asUser(db, outsider, async ({ q }) => (await q("select public.dashboard_stats(30) as s")).rows[0].s);
    expect(none).toEqual({});
  });

  it("de dagelijkse samenvatting vereist het servergeheim", async () => {
    await asUser(db, null, async ({ deny, q }) => {
      await deny("select public.server_admin_digest('fout-geheim')");
      const rows = (await q("select public.server_admin_digest($1) as d", [SERVER_SECRET])).rows[0].d;
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows[0]).toHaveProperty("admins");
    });
  });

  it("alt-teksten kunnen door een makelaar worden gezet, niet door een redacteur", async () => {
    await asUser(db, redacteurA, async ({ q }) => {
      const r = await q("update public.property_documents set alt_text_nl = 'x' where id = $1", [documentA]);
      expect(r.rowCount).toBe(0);
    });
    await asUser(db, makelaarA, async ({ q }) => {
      const r = await q("update public.property_documents set alt_text_nl = 'Woonkamer met erker', storage_path = 'hack' where id = $1 returning alt_text_nl, storage_path", [documentA]);
      expect(r.rows[0].alt_text_nl).toBe("Woonkamer met erker");
      expect(r.rows[0].storage_path).not.toBe("hack");
    });
  });
});

describe("twee-stapsverificatie (MFA)", () => {
  async function withFactor<T>(user: TestUser, status: "verified" | "unverified", fn: () => Promise<T>) {
    const { rows } = await db.query("insert into auth.mfa_factors (user_id, status) values ($1, $2) returning id", [user.id, status]);
    try {
      return await fn();
    } finally {
      await db.query("delete from auth.mfa_factors where id = $1", [rows[0].id]);
    }
  }

  it("gebruiker zonder factor werkt ongewijzigd met een aal1-sessie", async () => {
    await asUser(db, makelaarA, async ({ q }) => {
      expect((await q("select id from public.properties where id = $1", [propertyA])).rowCount).toBe(1);
      expect((await q("select * from public.mfa_status()")).rows[0]).toEqual({ has_verified_factor: false, current_level: "aal1" });
    }, { aal: "aal1" });
  });

  it("gebruiker met geverifieerde factor ziet zonder aal2 geen organisatiegegevens (gestolen wachtwoord)", async () => {
    await withFactor(makelaarA, "verified", async () => {
      await asUser(db, makelaarA, async ({ q, deny }) => {
        expect((await q("select * from public.mfa_status()")).rows[0]).toEqual({ has_verified_factor: true, current_level: "aal1" });
        expect((await q("select id from public.properties")).rowCount).toBe(0);
        expect((await q("select id from public.content_versions")).rowCount).toBe(0);
        expect((await q("select id from storage.objects")).rowCount).toBe(0);
        await deny("insert into public.properties (organization_id, address) values ($1, 'x')", [orgA]);
        await deny("select * from public.save_content_version($1, 'funda', 'nl', '<p>x</p>', 'handmatig', 0)", [propertyA]);
        // Eigen lidmaatschap blijft leesbaar zodat de app naar de verificatiestap kan sturen.
        expect((await q("select role from public.organization_memberships where user_id = $1", [makelaarA.id])).rows[0]?.role).toBe("makelaar");
      }, { aal: "aal1" });
      await asUser(db, makelaarA, async ({ q }) => {
        expect((await q("select id from public.properties where id = $1", [propertyA])).rowCount).toBe(1);
      }, { aal: "aal2" });
    });
  });

  it("een niet-geverifieerde factor telt niet mee", async () => {
    await withFactor(makelaarA, "unverified", async () => {
      await asUser(db, makelaarA, async ({ q }) => {
        expect((await q("select id from public.properties where id = $1", [propertyA])).rowCount).toBe(1);
      }, { aal: "aal1" });
    });
  });

  it("admin zonder aal2 kan geen beheeracties uitvoeren, maar wel gewone acties", async () => {
    await asUser(db, adminA, async ({ q, deny }) => {
      const upd = await q("update public.organization_settings set ai_daily_cost_limit_eur = 99");
      expect(upd.rowCount).toBe(0);
      await deny("select public.admin_create_invitation('mfa-nieuw@example.test', 'redacteur')");
      await deny("select public.publish_style_guide('x', repeat('a', 100), 'poging', true)");
      await deny("select public.purge_property($1)", [propertyA]);
      expect((await q("select id from public.audit_logs")).rowCount).toBe(0);
      // Niet-beheerfuncties blijven werken.
      expect((await q("select id from public.properties where id = $1", [propertyA])).rowCount).toBe(1);
      await q("insert into public.properties (organization_id, address) values ($1, 'MFA-test')", [orgA]);
    }, { aal: "aal1" });
    await asUser(db, adminA, async ({ q }) => {
      const upd = await q("update public.organization_settings set ai_daily_cost_limit_eur = ai_daily_cost_limit_eur");
      expect(upd.rowCount).toBe(1);
    }, { aal: "aal2" });
  });

  it("mfa_status is niet beschikbaar voor anonieme gebruikers", async () => {
    await asUser(db, null, async ({ deny }) => {
      await deny("select * from public.mfa_status()");
    });
  });
});

describe("schrijfstijlen per makelaar", () => {
  it("elke organisatie krijgt de drie standaardstijlen; alleen eigen stijlen zijn zichtbaar", async () => {
    const a = await asUser(db, redacteurA, async ({ q }) => (await q("select name, organization_id from public.writing_styles order by sort_order")).rows);
    expect(a.map((r) => r.name)).toEqual(["Wim", "Vivianne", "Anne-Louise"]);
    expect(a.every((r) => r.organization_id === orgA)).toBe(true);
  });

  it("alleen een administrator kan stijlen wijzigen of toevoegen; organisatie is niet te wijzigen", async () => {
    await asUser(db, makelaarA, async ({ q, deny }) => {
      const r = await q("update public.writing_styles set label = 'gehackt' where name = 'Wim'");
      expect(r.rowCount).toBe(0);
      await deny("insert into public.writing_styles (organization_id, name, label, instruction) values ($1, 'X', 'X', repeat('a', 30))", [orgA]);
    });
    await asUser(db, adminA, async ({ q }) => {
      const r = await q("update public.writing_styles set label = 'Wim – kort en zakelijk', organization_id = $1 where name = 'Wim' returning label, organization_id", [orgB]);
      expect(r.rows[0]).toEqual({ label: "Wim – kort en zakelijk", organization_id: orgA });
      await q("insert into public.writing_styles (organization_id, name, label, instruction) values ($1, 'Kees', 'Kees – poëtisch', repeat('a', 30))", [orgA]);
    });
  });

  it("een woning kan niet aan een stijl van een andere organisatie worden gekoppeld", async () => {
    const styleB = (await db.query("select id from public.writing_styles where organization_id = $1 limit 1", [orgB])).rows[0].id;
    const styleA = (await db.query("select id from public.writing_styles where organization_id = $1 limit 1", [orgA])).rows[0].id;
    await asUser(db, makelaarA, async ({ q, deny }) => {
      await deny("update public.properties set writing_style_id = $1 where id = $2", [styleB, propertyA]);
      const ok = await q("update public.properties set writing_style_id = $1 where id = $2 returning writing_style_id", [styleA, propertyA]);
      expect(ok.rows[0].writing_style_id).toBe(styleA);
    });
  });
});
