"use client";

import { useCallback, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/common/status-badge";
import { GenerationPanel } from "./generation-panel";
import { SlotEditor, type SlotPermissions } from "./slot-editor";
import { CHANNEL_LABELS } from "@/lib/domain/labels";
import type { Channel, ContentVersionRow, Language, ReviewIssueRow } from "@/lib/db-types";
import type { PublicJob } from "@/lib/pipeline/jobs";
import { cn } from "@/lib/utils";

const CHANNELS: Channel[] = ["funda", "website", "facebook", "instagram"];

export function TextsWorkspace({
  propertyId,
  versionsBySlot,
  issues,
  names,
  permissions,
  canGenerate,
  blockers,
  job,
  protectedSlots,
  archived,
}: {
  propertyId: string;
  versionsBySlot: Record<string, ContentVersionRow[]>;
  issues: ReviewIssueRow[];
  names: Record<string, string>;
  permissions: SlotPermissions;
  canGenerate: boolean;
  blockers: string[];
  job: PublicJob | null;
  protectedSlots: string[];
  archived: boolean;
}) {
  const [channel, setChannel] = useState<Channel>("funda");
  const [language, setLanguage] = useState<Language>("nl");
  const [dirtySlots, setDirtySlots] = useState<Set<string>>(new Set());

  const markDirty = useCallback((slot: string, dirty: boolean) => {
    setDirtySlots((prev) => {
      if (prev.has(slot) === dirty) return prev;
      const n = new Set(prev);
      if (dirty) n.add(slot);
      else n.delete(slot);
      return n;
    });
  }, []);

  const statusDot = (c: Channel) => {
    const latest = ["nl", "en"].map((l) => versionsBySlot[`${c}:${l}`]?.[0]);
    if (latest.every((v) => v?.status === "goedgekeurd")) return "bg-success";
    if (latest.some((v) => v?.status === "ter_controle")) return "bg-warning";
    if (latest.some(Boolean)) return "bg-primary/50";
    return "bg-border";
  };

  return (
    <div className="space-y-6">
      <GenerationPanel
        propertyId={propertyId}
        initialJob={job}
        protectedSlots={protectedSlots}
        canGenerate={canGenerate && !archived}
        blockers={blockers}
        hasUnsavedChanges={dirtySlots.size > 0}
      />

      <Tabs value={channel} onValueChange={(v) => setChannel(v as Channel)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList aria-label="Kanaal">
            {CHANNELS.map((c) => (
              <TabsTrigger key={c} value={c} className="gap-2">
                <span className={cn("size-1.5 rounded-full", statusDot(c))} aria-hidden />
                {CHANNEL_LABELS[c]}
                {dirtySlots.has(`${c}:nl`) || dirtySlots.has(`${c}:en`) ? <span className="text-warning" aria-label="niet opgeslagen">•</span> : null}
              </TabsTrigger>
            ))}
          </TabsList>
          <div role="radiogroup" aria-label="Taal" className="inline-flex rounded-lg border bg-card p-0.5">
            {(["nl", "en"] as Language[]).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={language === l}
                onClick={() => setLanguage(l)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-colors",
                  language === l && "bg-primary text-primary-foreground",
                )}
              >
                {l === "nl" ? "Nederlands" : "Engels"}
                {dirtySlots.has(`${channel}:${l}`) ? " •" : ""}
              </button>
            ))}
          </div>
        </div>
        {CHANNELS.map((c) => (
          <TabsContent key={c} value={c} className="mt-4" forceMount>
            {(["nl", "en"] as Language[]).map((l) => (
              <div key={l} hidden={!(c === channel && l === language)}>
                <SlotEditor
                  key={versionsBySlot[`${c}:${l}`]?.[0]?.id ?? "leeg"}
                  propertyId={propertyId}
                  channel={c}
                  language={l}
                  versions={versionsBySlot[`${c}:${l}`] ?? []}
                  issues={issues}
                  names={names}
                  permissions={permissions}
                  onDirtyChange={(d) => markDirty(`${c}:${l}`, d)}
                  archived={archived}
                />
              </div>
            ))}
          </TabsContent>
        ))}
      </Tabs>

      {issues.filter((i) => !i.content_version_id && i.resolution_status === "open" && i.category !== "extractie").length ? (
        <p className="text-sm">
          <StatusBadge tone="warning">Let op</StatusBadge>{" "}
          <span className="text-muted-foreground">Er staan algemene controlepunten open op het tabblad Overzicht.</span>
        </p>
      ) : null}
    </div>
  );
}
