"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, CircleHelp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type Tone } from "@/components/common/status-badge";
import { CONFIDENCE_LABELS, VERIFICATION_LABELS } from "@/lib/domain/labels";
import type { FieldReview } from "@/lib/domain/facts";
import type { VerificationStatus } from "@/lib/db-types";
import { chooseFactValue, confirmCurrentValue, rejectFact } from "@/app/(app)/woningen/[id]/bronnen/actions";

const TONE: Record<VerificationStatus, Tone> = { conflict: "warning", onbevestigd: "primary", bevestigd: "success", afgewezen: "neutral" };

export function FactsReview({
  propertyId,
  reviews,
  documentNames,
  canVerify,
}: {
  propertyId: string;
  reviews: FieldReview[];
  documentNames: Record<string, string>;
  canVerify: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [, startTransition] = useTransition();

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: { message: string } }>, success: string) {
    setPending(key);
    const res = await fn();
    setPending(null);
    if (res.ok) toast.success(success);
    else toast.error(res.error?.message ?? "Actie mislukt.");
    startTransition(() => router.refresh());
  }

  const open = reviews.filter((r) => r.status === "conflict" || r.status === "onbevestigd");
  const done = reviews.filter((r) => r.status === "bevestigd" || r.status === "afgewezen");
  const visible = showDone ? reviews : open;

  if (reviews.length === 0) {
    return <p className="text-sm text-muted-foreground">Nog geen gegevens uit bronnen gehaald. Upload of plak een bron en kies &ldquo;Analyseren&rdquo;.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {open.length === 0 ? "Alle brongegevens zijn beoordeeld." : `${open.length} ${open.length === 1 ? "veld vraagt" : "velden vragen"} om uw beoordeling.`}
        </p>
        {done.length ? (
          <Button variant="ghost" size="sm" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Alleen openstaande tonen" : `Ook ${done.length} beoordeelde velden tonen`}
          </Button>
        ) : null}
      </div>
      {visible.map((r) => (
        <article key={r.field} className={`rounded-xl border bg-card ${r.status === "conflict" ? "border-warning/40" : ""}`} aria-labelledby={`f-${r.field}`}>
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              {r.status === "conflict" ? <AlertTriangle className="size-4 text-warning" aria-hidden /> : <CircleHelp className="size-4 text-muted-foreground" aria-hidden />}
              <h3 id={`f-${r.field}`} className="text-sm font-semibold">
                {r.label}
              </h3>
              <StatusBadge tone={TONE[r.status]}>{r.status === "conflict" ? "Handmatige controle vereist" : VERIFICATION_LABELS[r.status]}</StatusBadge>
            </div>
            <p className="text-xs text-muted-foreground">
              In woningprofiel: <span className="font-medium text-foreground">{r.currentValue ?? "leeg"}</span>
            </p>
          </header>
          <ul className="divide-y">
            {r.facts.map((f, i) => (
              <li key={f.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="mr-2 text-xs font-medium text-muted-foreground">Bron {String.fromCharCode(65 + i)}</span>
                    <span className="font-medium whitespace-pre-line">{f.field_value}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {f.source_type === "document" ? documentNames[f.source_document_id ?? ""] ?? "Document" : f.source_type === "geplakte_tekst" ? "Geplakte tekst" : "Handmatig"}
                    {f.source_reference ? ` · ${f.source_reference}` : ""} · betrouwbaarheid {CONFIDENCE_LABELS[f.confidence].toLowerCase()}
                  </p>
                  {f.source_quote ? <blockquote className="mt-1.5 border-l-2 pl-2 text-xs text-muted-foreground italic">&ldquo;{f.source_quote}&rdquo;</blockquote> : null}
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusBadge tone={TONE[f.verification_status]}>{VERIFICATION_LABELS[f.verification_status]}</StatusBadge>
                  {canVerify && f.verification_status !== "bevestigd" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending !== null}
                      onClick={() => void run(f.id, () => chooseFactValue({ propertyId, field: r.field, factId: f.id }), `${r.label}: waarde overgenomen.`)}
                    >
                      {pending === f.id ? <Loader2 className="animate-spin" /> : <Check />} Deze waarde gebruiken
                    </Button>
                  ) : null}
                  {canVerify && f.verification_status !== "afgewezen" && f.verification_status !== "bevestigd" ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Afwijzen"
                      disabled={pending !== null}
                      onClick={() => void run(`r-${f.id}`, () => rejectFact({ propertyId, factId: f.id }), "Bronwaarde afgewezen.")}
                    >
                      <X />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {canVerify && r.currentValue && (r.status === "conflict" || r.status === "onbevestigd") ? (
            <footer className="border-t px-4 py-2.5">
              <Button
                size="sm"
                variant="ghost"
                disabled={pending !== null}
                onClick={() => void run(`c-${r.field}`, () => confirmCurrentValue({ propertyId, field: r.field }), `${r.label}: huidige waarde bevestigd.`)}
              >
                {pending === `c-${r.field}` ? <Loader2 className="animate-spin" /> : <Check />} Huidige waarde &ldquo;{r.currentValue.slice(0, 40)}&rdquo; is juist
              </Button>
            </footer>
          ) : null}
        </article>
      ))}
    </div>
  );
}
