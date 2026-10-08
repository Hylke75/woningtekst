import type { Metadata } from "next";
import { requirePageSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProperty, listColleagues } from "@/lib/data/properties";
import { listIssues } from "@/lib/data/sources";
import { fromDbError } from "@/lib/errors";
import { sanitizeContentHtml } from "@/lib/content/html";
import { missingForGeneration } from "@/lib/domain/property-mapping";
import { protectedSlots } from "@/lib/pipeline/generation";
import { publicJob } from "@/lib/pipeline/jobs";
import { aiConfigured } from "@/lib/env";
import { TextsWorkspace } from "@/components/texts/texts-workspace";
import type { ContentVersionRow, JobRow } from "@/lib/db-types";

export const metadata: Metadata = { title: "Teksten" };

export default async function TextsPage({ params }: PageProps<"/woningen/[id]/teksten">) {
  const session = await requirePageSession();
  const { id } = await params;
  const supabase = await createClient();
  const [property, issues, colleagues, versionsRes, jobRes, conflictRes, prot, guideRes] = await Promise.all([
    getProperty(id),
    listIssues(id),
    listColleagues(),
    supabase.from("content_versions").select("*").eq("property_id", id).order("version_number", { ascending: false }),
    supabase.from("generation_jobs").select("*").eq("property_id", id).eq("job_type", "volledige_generatie").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("property_facts").select("id", { count: "exact", head: true }).eq("property_id", id).eq("verification_status", "conflict"),
    protectedSlots(supabase, id),
    supabase.from("style_guides").select("id").eq("is_active", true).maybeSingle(),
  ]);
  if (versionsRes.error) throw fromDbError(versionsRes.error);

  const versionsBySlot: Record<string, ContentVersionRow[]> = {};
  for (const v of (versionsRes.data ?? []) as ContentVersionRow[]) {
    // Defense in depth: ook bij het tonen opnieuw saneren.
    (versionsBySlot[`${v.channel}:${v.language}`] ??= []).push({ ...v, content: sanitizeContentHtml(v.content) });
  }

  const blockers: string[] = [];
  const missing = missingForGeneration(property);
  if (missing.length) blockers.push(`Vul eerst in: ${missing.map((f) => f.label.toLowerCase()).join(", ")}.`);
  if ((conflictRes.count ?? 0) > 0) blockers.push(`Beoordeel eerst ${conflictRes.count} conflicterend(e) gegeven(s) onder Bronnen en controle.`);
  if (!property.data_checked_at) blockers.push("Bevestig op het tabblad Gegevens dat u de woninggegevens heeft gecontroleerd.");
  if (!guideRes.data) blockers.push("Er is nog geen actieve schrijfwijzer.");
  if (!aiConfigured()) blockers.push("Claude is nog niet gekoppeld (ANTHROPIC_API_KEY ontbreekt). Neem contact op met een administrator.");

  return (
    <TextsWorkspace
      propertyId={property.id}
      versionsBySlot={versionsBySlot}
      issues={issues}
      names={Object.fromEntries(colleagues.map((c) => [c.id, c.name]))}
      permissions={{
        edit: can(session.role, "texts.edit"),
        regenerate: can(session.role, "texts.regenerate_one") && aiConfigured(),
        submit: can(session.role, "texts.submit"),
        approve: can(session.role, "texts.approve", session.approvalRoles),
      }}
      canGenerate={can(session.role, "texts.generate_all")}
      blockers={blockers}
      job={jobRes.data ? publicJob(jobRes.data as JobRow) : null}
      protectedSlots={prot}
      archived={Boolean(property.deleted_at)}
    />
  );
}
