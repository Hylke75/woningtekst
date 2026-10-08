import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { fromDbError } from "@/lib/errors";
import { aiConfigured } from "@/lib/env";
import { listColleagues } from "@/lib/data/properties";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { MarkdownView } from "@/components/styleguide/markdown-view";
import { ActivateDefaultButton, ActivateVersionButton, StyleGuideEditor } from "@/components/styleguide/style-guide-admin";
import type { StyleGuideRow } from "@/lib/db-types";

export const metadata: Metadata = { title: "Schrijfwijzer" };

export default async function StyleGuidePage() {
  const session = await requirePageSession();
  const supabase = await createClient();
  const [{ data, error }, colleagues] = await Promise.all([supabase.from("style_guides").select("*").order("version", { ascending: false }), listColleagues()]);
  if (error) throw fromDbError(error);
  const versions = (data ?? []) as StyleGuideRow[];
  const active = versions.find((v) => v.is_active);
  const isAdmin = can(session.role, "styleguide.edit");
  const names = Object.fromEntries(colleagues.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader
        title="Schrijfwijzer"
        description={active ? `Actieve versie ${active.version} · ${active.title}` : "Er is nog geen actieve schrijfwijzer."}
      />
      {!active ? (
        <div className="mb-6 rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Zonder actieve schrijfwijzer kunnen geen teksten worden gegenereerd.{" "}
            {isAdmin ? "Activeer de standaardschrijfwijzer of publiceer een eigen versie." : "Vraag een administrator om de schrijfwijzer te activeren."}
          </p>
          {isAdmin ? (
            <div className="mt-4">
              <ActivateDefaultButton />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-8 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {isAdmin ? (
            <StyleGuideEditor initialTitle={active?.title ?? "Schrijfwijzer Korff de Gidts"} initialContent={active?.content ?? ""} aiAvailable={aiConfigured()} />
          ) : active ? (
            <article className="rounded-xl border bg-card px-6 py-4">
              <MarkdownView markdown={active.content} />
            </article>
          ) : null}
        </div>
        <aside className="space-y-3">
          <h2 className="text-sm font-semibold">Versiegeschiedenis</h2>
          <p className="text-xs text-muted-foreground">Elke tekstversie registreert met welke schrijfwijzerversie ze is gemaakt. Een nieuwe versie wijzigt nooit automatisch bestaande of goedgekeurde teksten.</p>
          <ol className="space-y-2">
            {versions.map((v) => (
              <li key={v.id} className="rounded-lg border bg-card px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Versie {v.version}</span>
                  {v.is_active ? <StatusBadge tone="success">Actief</StatusBadge> : null}
                  {isAdmin && !v.is_active ? (
                    <span className="ml-auto">
                      <ActivateVersionButton id={v.id} />
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateTime(v.created_at)} · {names[v.created_by ?? ""] ?? "onbekend"}
                </p>
                {v.change_note ? <p className="mt-1 text-xs">{v.change_note}</p> : null}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}
