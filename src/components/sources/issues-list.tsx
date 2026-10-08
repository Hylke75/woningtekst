"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertOctagon, AlertTriangle, Info, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEVERITY_LABELS } from "@/lib/domain/labels";
import type { ReviewIssueRow } from "@/lib/db-types";
import { resolveIssue } from "@/app/(app)/woningen/[id]/teksten/actions";

const ICON = { kritiek: AlertOctagon, waarschuwing: AlertTriangle, info: Info } as const;
const COLOR = { kritiek: "text-destructive", waarschuwing: "text-warning", info: "text-muted-foreground" } as const;

export function IssuesList({ issues, emptyText = "Geen openstaande controlepunten." }: { issues: ReviewIssueRow[]; emptyText?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const open = issues.filter((i) => i.resolution_status === "open");
  const closed = issues.filter((i) => i.resolution_status !== "open");
  const [showClosed, setShowClosed] = useState(false);

  async function set(id: string, status: "open" | "opgelost" | "genegeerd") {
    setBusy(id);
    const res = await resolveIssue({ issueId: id, status });
    setBusy(null);
    if (!res.ok) toast.error(res.error.message);
    startTransition(() => router.refresh());
  }

  const list = showClosed ? [...open, ...closed] : open;
  return (
    <div className="space-y-2">
      {open.length === 0 ? <p className="text-sm text-muted-foreground">{emptyText}</p> : null}
      <ul className="space-y-2">
        {list.map((i) => {
          const Icon = ICON[i.severity];
          return (
            <li key={i.id} className={`flex gap-3 rounded-lg border bg-card px-3 py-2.5 ${i.resolution_status !== "open" ? "opacity-60" : ""}`}>
              <Icon className={`mt-0.5 size-4 shrink-0 ${COLOR[i.severity]}`} aria-label={SEVERITY_LABELS[i.severity]} />
              <div className="min-w-0 flex-1">
                <p className="text-sm">{i.description}</p>
                {i.source_details ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{i.source_details}</p> : null}
              </div>
              <div className="flex shrink-0 items-start gap-1">
                {i.resolution_status === "open" ? (
                  <>
                    <Button size="xs" variant="ghost" disabled={busy === i.id} onClick={() => void set(i.id, "opgelost")}>
                      Opgelost
                    </Button>
                    <Button size="xs" variant="ghost" disabled={busy === i.id} onClick={() => void set(i.id, "genegeerd")}>
                      Negeren
                    </Button>
                  </>
                ) : (
                  <Button size="icon-xs" variant="ghost" aria-label="Heropenen" disabled={busy === i.id} onClick={() => void set(i.id, "open")}>
                    <RotateCcw />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {closed.length ? (
        <Button size="sm" variant="ghost" onClick={() => setShowClosed((v) => !v)}>
          {showClosed ? "Afgehandelde punten verbergen" : `${closed.length} afgehandelde punten tonen`}
        </Button>
      ) : null}
    </div>
  );
}
