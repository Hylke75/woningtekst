import type { Metadata } from "next";
import Link from "next/link";
import { requirePageSession } from "@/lib/auth/session";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { serverEnv, aiConfigured } from "@/lib/env";
import { listColleagues } from "@/lib/data/properties";
import { formatCost, formatDateTime, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { OrganizationSettingsForm, ProfileForm } from "@/components/admin/settings-forms";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OrganizationSettingsRow } from "@/lib/db-types";

export const metadata: Metadata = { title: "Instellingen" };

type UsageRow = {
  id: string;
  user_id: string | null;
  property_id: string | null;
  operation: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  status: string;
  error_code: string | null;
  created_at: string;
};

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <header className="border-b px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const session = await requirePageSession();
  const isAdmin = can(session.role, "settings.edit");
  const supabase = await createClient();
  const env = serverEnv();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const [settingsRes, usageRes, monthRes, colleagues, retentionRes, auditRes] = await Promise.all([
    supabase.from("organization_settings").select("*").maybeSingle(),
    supabase.from("ai_usage_events").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("ai_usage_events").select("estimated_cost, created_at, status").gte("created_at", monthStart).limit(10000),
    listColleagues(),
    isAdmin ? supabase.rpc("retention_candidates") : Promise.resolve({ data: [] as { property_id: string; label: string; reason: string; last_change: string }[] }),
    isAdmin ? supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
  ]);
  const settings = settingsRes.data as OrganizationSettingsRow | null;
  const usage = (usageRes.data ?? []) as UsageRow[];
  const month = (monthRes.data ?? []) as { estimated_cost: number; created_at: string; status: string }[];
  const monthCost = month.reduce((s, r) => s + Number(r.estimated_cost), 0);
  const dayCost = month.filter((r) => r.created_at >= dayStart).reduce((s, r) => s + Number(r.estimated_cost), 0);
  const names = Object.fromEntries(colleagues.map((c) => [c.id, c.name]));
  const retention = (retentionRes.data ?? []) as { property_id: string; label: string; reason: string; last_change: string }[];
  const audit = (auditRes.data ?? []) as { id: number; user_id: string | null; action: string; entity_type: string; entity_id: string | null; metadata: Record<string, unknown>; created_at: string }[];

  return (
    <>
      <PageHeader title="Instellingen" description={`${session.organizationName} · ingelogd als ${ROLE_LABELS[session.role].toLowerCase()}`} />
      <div className="space-y-6">
        <Section title="Uw profiel" description={session.email}>
          <ProfileForm fullName={session.fullName} />
          <p className="mt-3 text-xs text-muted-foreground">
            Wachtwoord wijzigen? Gebruik{" "}
            <Link href="/wachtwoord-vergeten" className="text-primary hover:underline">
              wachtwoord vergeten
            </Link>{" "}
            voor een herstellink.
          </p>
        </Section>

        <Section title={isAdmin ? "AI-verbruik (organisatie)" : "Uw AI-verbruik"} description="Geschatte kosten op basis van tokengebruik; de factuur van Anthropic is leidend.">
          <dl className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Vandaag</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatCost(dayCost)}</dd>
              {settings ? <dd className="text-xs text-muted-foreground">budget {formatCost(settings.ai_daily_cost_limit_eur)}</dd> : null}
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Deze maand</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatCost(monthCost)}</dd>
              {settings ? <dd className="text-xs text-muted-foreground">budget {formatCost(settings.ai_monthly_cost_limit_eur)}</dd> : null}
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Verzoeken deze maand</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatNumber(month.length)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Mislukt deze maand</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatNumber(month.filter((m) => m.status === "fout").length)}</dd>
            </div>
          </dl>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tijdstip</TableHead>
                  <TableHead>Gebruiker</TableHead>
                  <TableHead>Bewerking</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Tokens in/uit</TableHead>
                  <TableHead className="text-right">Kosten</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      Nog geen AI-verbruik.
                    </TableCell>
                  </TableRow>
                ) : null}
                {usage.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(u.created_at)}</TableCell>
                    <TableCell className="text-xs">{names[u.user_id ?? ""] ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {u.property_id ? (
                        <Link href={`/woningen/${u.property_id}`} className="hover:underline">
                          {u.operation}
                        </Link>
                      ) : (
                        u.operation
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{u.model}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatNumber(u.input_tokens)} / {formatNumber(u.output_tokens)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatCost(u.estimated_cost)}</TableCell>
                    <TableCell>
                      <StatusBadge tone={u.status === "succes" ? "success" : u.status === "fout" ? "danger" : "neutral"}>{u.status === "fout" ? (u.error_code ?? "fout") : u.status}</StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>

        {isAdmin && settings ? (
          <Section title="Organisatie" description="Limieten voor AI-gebruik, goedkeuringsrechten en bewaartermijnen.">
            <OrganizationSettingsForm settings={settings} />
          </Section>
        ) : null}

        {isAdmin ? (
          <Section title="Bewaarbeleid" description="Dossiers die volgens het bewaarbeleid voor verwijdering in aanmerking komen. Er wordt nooit automatisch verwijderd; controleer eerst wettelijke bewaarplichten.">
            {retention.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen dossiers die de bewaartermijn hebben overschreden.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {retention.map((r) => (
                  <li key={r.property_id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <Link href={`/woningen/${r.property_id}`} className="font-medium hover:underline">
                      {r.label || "Woning zonder adres"}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {r.reason === "verkocht_of_ingetrokken" ? "Verkocht/ingetrokken" : "Inactief concept"} · laatst gewijzigd {formatDateTime(r.last_change)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}

        <Section title="Configuratie" description="Status van de koppelingen (geen geheimen).">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Claude</dt>
              <dd>{aiConfigured() ? (env.AI_MOCK ? <StatusBadge tone="warning">Testmodus (mock)</StatusBadge> : <StatusBadge tone="success">Gekoppeld</StatusBadge>) : <StatusBadge tone="danger">Niet gekoppeld</StatusBadge>}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Model</dt>
              <dd>{env.ANTHROPIC_MODEL}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Uitnodigingsmails</dt>
              <dd>{env.SUPABASE_SECRET_KEY ? "Via Supabase Auth" : "Handmatig (registratielink delen)"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Uploads</dt>
              <dd>
                max. {env.UPLOAD_MAX_FILE_MB} MB per bestand, {env.UPLOAD_MAX_FILES_PER_PROPERTY} per woning
              </dd>
            </div>
          </dl>
        </Section>

        {isAdmin ? (
          <Section title="Auditlog" description="De laatste 100 belangrijke acties. Het auditlog kan niet worden gewijzigd of verwijderd.">
            <div className="max-h-[480px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tijdstip</TableHead>
                    <TableHead>Gebruiker</TableHead>
                    <TableHead>Actie</TableHead>
                    <TableHead>Onderdeel</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap text-xs">{formatDateTime(a.created_at)}</TableCell>
                      <TableCell className="text-xs">{names[a.user_id ?? ""] ?? (a.user_id ? "—" : "systeem")}</TableCell>
                      <TableCell className="text-xs">{a.action}</TableCell>
                      <TableCell className="text-xs">{a.entity_type}</TableCell>
                      <TableCell className="max-w-md truncate font-mono text-[11px] text-muted-foreground">{JSON.stringify(a.metadata)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>
        ) : null}
      </div>
    </>
  );
}
