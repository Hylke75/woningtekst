"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Circle, Loader2, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, newIdempotencyKey } from "@/lib/client-api";
import { CHANNEL_LABELS, LANGUAGE_LABELS } from "@/lib/domain/labels";
import type { Channel, Language } from "@/lib/db-types";
import type { PublicJob } from "@/lib/pipeline/jobs";

const STEPS = [
  { key: "analyse", label: "Profiel analyseren en verkoopargumenten bepalen" },
  { key: "nederlands", label: "Nederlandse teksten schrijven" },
  { key: "engels", label: "Engelse teksten redigeren" },
  { key: "seo", label: "SEO-gegevens en hashtags" },
  { key: "controle", label: "Overeenstemming NL/EN en eindcontrole" },
  { key: "opslaan", label: "Opslaan" },
] as const;

/** Maximaal aantal opeenvolgende stapverzoeken; voorkomt een eindeloze lus. */
const MAX_STEP_CALLS = 20;

function slotLabel(key: string) {
  const [c, l] = key.split(":") as [Channel, Language];
  return `${CHANNEL_LABELS[c]} ${LANGUAGE_LABELS[l].toLowerCase()}`;
}

export function GenerationPanel({
  propertyId,
  initialJob,
  protectedSlots,
  canGenerate,
  blockers,
  hasUnsavedChanges,
}: {
  propertyId: string;
  initialJob: PublicJob | null;
  protectedSlots: string[];
  canGenerate: boolean;
  blockers: string[];
  hasUnsavedChanges: boolean;
}) {
  const router = useRouter();
  const [job, setJob] = useState<PublicJob | null>(initialJob);
  const [running, setRunning] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [overwrite, setOverwrite] = useState<Set<string>>(new Set());
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const drive = useCallback(
    async (jobId: string) => {
      setRunning(true);
      abort.current = new AbortController();
      for (let i = 0; i < MAX_STEP_CALLS; i++) {
        const res = await api<{ job: PublicJob }>(`/api/jobs/${jobId}/verder`, { method: "POST", body: {}, signal: abort.current.signal });
        if (!res.ok) {
          if (res.error.code === "afgebroken") break;
          setJob((j) => (j ? { ...j, status: "mislukt", errorMessage: res.error.message } : j));
          toast.error(res.error.message);
          break;
        }
        setJob(res.data.job);
        if (res.data.job.status === "voltooid") {
          toast.success("Alle teksten zijn gegenereerd. Controleer de controlepunten.");
          router.refresh();
          break;
        }
        if (res.data.job.status === "mislukt" || res.data.job.status === "geannuleerd") {
          if (res.data.job.status === "mislukt") toast.error(res.data.job.errorMessage ?? "De generatie is mislukt.");
          break;
        }
        if (res.data.job.status === "bezig") {
          // Een ander verzoek verwerkt deze stap; even wachten.
          await new Promise((r) => setTimeout(r, 4000));
        }
      }
      setRunning(false);
    },
    [router],
  );

  async function start() {
    setDialogOpen(false);
    const res = await api<{ job: PublicJob }>(`/api/woningen/${propertyId}/generatie`, {
      body: { idempotencyKey: newIdempotencyKey("gen"), overwriteSlots: [...overwrite] },
    });
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    setJob(res.data.job);
    await drive(res.data.job.id);
  }

  async function cancel() {
    if (!job) return;
    abort.current?.abort();
    const res = await api<{ job: PublicJob }>(`/api/jobs/${job.id}/annuleer`, { method: "POST", body: {} });
    if (res.ok) setJob(res.data.job);
    setRunning(false);
  }

  const active = job && (running || job.status === "bezig" || job.status === "wachtrij" || job.status === "onderbroken" || job.status === "mislukt");
  const done = job?.completedSteps ?? [];
  const progress = Math.round((done.length / STEPS.length) * 100);

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Teksten genereren</h2>
          <p className="text-sm text-muted-foreground">Acht teksten (Funda, website, Facebook en Instagram, in het Nederlands en Engels) met SEO-gegevens en hashtags.</p>
        </div>
        {canGenerate ? (
          <Button size="lg" disabled={running || blockers.length > 0 || job?.status === "bezig"} onClick={() => setDialogOpen(true)}>
            {running ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {running ? "Bezig met genereren…" : "Alle teksten genereren"}
          </Button>
        ) : null}
      </div>

      {blockers.length && canGenerate ? (
        <ul className="mt-3 space-y-1 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
          {blockers.map((b) => (
            <li key={b} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {b}
            </li>
          ))}
        </ul>
      ) : null}

      {active ? (
        <div className="mt-4 space-y-3" aria-live="polite">
          <Progress value={progress} aria-label="Voortgang generatie" />
          <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s) => {
              const isDone = done.includes(s.key);
              const isCurrent = !isDone && job.currentStep === s.key && running;
              return (
                <li key={s.key} className="flex items-center gap-2 text-sm">
                  {isDone ? <CheckCircle2 className="size-4 text-success" /> : isCurrent ? <Loader2 className="size-4 animate-spin text-primary" /> : <Circle className="size-4 text-muted-foreground" />}
                  <span className={isDone ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
                </li>
              );
            })}
          </ol>
          {!running && (job.status === "mislukt" || job.status === "onderbroken" || job.status === "wachtrij") ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
              <XCircle className="size-4 text-destructive" />
              <p className="flex-1 text-sm">
                {job.status === "mislukt" ? (job.errorMessage ?? "De generatie is gestopt door een fout.") : "De generatie is onderbroken."} Reeds voltooide stappen blijven bewaard.
              </p>
              <Button size="sm" onClick={() => void drive(job.id)}>
                <RotateCcw /> Hervatten
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void cancel()}>
                Annuleren
              </Button>
            </div>
          ) : running ? (
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => void cancel()}>
                Stoppen
              </Button>
            </div>
          ) : null}
        </div>
      ) : job?.status === "voltooid" ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="size-3.5 text-success" /> Laatste generatie voltooid
          {job.finishedAt ? ` op ${new Date(job.finishedAt).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}` : ""}.
        </p>
      ) : null}

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Alle teksten genereren?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>Nieuwe teksten worden als nieuwe versie opgeslagen; eerdere versies blijven altijd beschikbaar in de versiegeschiedenis.</p>
                {hasUnsavedChanges ? (
                  <p className="rounded-md bg-warning/10 px-3 py-2 text-warning">U heeft niet-opgeslagen wijzigingen in de editor. Sla die eerst op, anders gaan ze verloren als de tekst wordt vervangen.</p>
                ) : null}
                {protectedSlots.length ? (
                  <div className="space-y-2">
                    <p>Deze teksten zijn handmatig bewerkt, ingediend of goedgekeurd en worden standaard NIET vervangen. Vink aan wat u toch opnieuw wilt laten genereren:</p>
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {protectedSlots.map((s) => (
                        <li key={s} className="flex items-center gap-2">
                          <Checkbox
                            id={`ow-${s}`}
                            checked={overwrite.has(s)}
                            onCheckedChange={(c) =>
                              setOverwrite((prev) => {
                                const n = new Set(prev);
                                if (c === true) n.add(s);
                                else n.delete(s);
                                return n;
                              })
                            }
                          />
                          <Label htmlFor={`ow-${s}`} className="font-normal text-foreground">
                            {slotLabel(s)}
                          </Label>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => void start()}>Genereren</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
