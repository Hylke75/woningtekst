"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Loader2, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DocumentsPanel } from "@/components/documents/documents-panel";
import { PastePanel } from "@/components/sources/paste-panel";
import { api, newIdempotencyKey } from "@/lib/client-api";
import type { DocumentRow } from "@/lib/db-types";

/** Methode A: bronnen aanleveren → Claude structureert → medewerker controleert het formulier. */
export function QuickEntry({ propertyId, documents }: { propertyId: string; documents: DocumentRow[] }) {
  const router = useRouter();
  const pendingDocs = documents.filter((d) => d.extraction_status === "niet_gestart" || d.extraction_status === "mislukt");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function analyseAll() {
    setProgress({ done: 0, total: pendingDocs.length });
    let failures = 0;
    for (const [i, doc] of pendingDocs.entries()) {
      const res = await api(`/api/woningen/${propertyId}/extractie`, {
        body: { idempotencyKey: newIdempotencyKey("ex"), source: { type: "document", documentId: doc.id } },
      });
      if (!res.ok) {
        failures++;
        toast.error(`${doc.filename}: ${res.error.message}`);
      }
      setProgress({ done: i + 1, total: pendingDocs.length });
    }
    setProgress(null);
    if (failures < pendingDocs.length) toast.success("Analyse afgerond. Controleer nu de voorgestelde gegevens.");
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border bg-card p-5" aria-labelledby="stap1">
        <h2 id="stap1" className="text-base font-semibold">
          1. Documenten uploaden
        </h2>
        <p className="mb-4 mt-0.5 text-sm text-muted-foreground">Verkoopdossier, meetrapport, plattegronden, energielabel of een bestaande omschrijving.</p>
        <DocumentsPanel propertyId={propertyId} documents={documents} canUpload canAnalyse={false} compact />
        {pendingDocs.length ? (
          <div className="mt-4 space-y-2">
            <Button onClick={() => void analyseAll()} disabled={progress !== null}>
              {progress ? <Loader2 className="animate-spin" /> : <ScanSearch />}
              {progress ? `Analyseren (${progress.done}/${progress.total})…` : `${pendingDocs.length} ${pendingDocs.length === 1 ? "document" : "documenten"} analyseren`}
            </Button>
            {progress ? <Progress value={(progress.done / Math.max(progress.total, 1)) * 100} aria-label="Voortgang analyse" /> : null}
          </div>
        ) : null}
      </section>
      <section className="rounded-xl border bg-card p-5" aria-labelledby="stap1b">
        <h2 id="stap1b" className="text-base font-semibold">
          Of: tekst plakken
        </h2>
        <p className="mb-4 mt-0.5 text-sm text-muted-foreground">Een bestaande woningomschrijving of notities.</p>
        <PastePanel propertyId={propertyId} />
      </section>
      <section className="rounded-xl border bg-accent/40 p-5 lg:col-span-2" aria-labelledby="stap2">
        <h2 id="stap2" className="text-base font-semibold">
          2. Controleren en corrigeren
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Door AI gevonden gegevens zijn voorstellen. Beoordeel conflicten, corrigeer waar nodig en bevestig daarna dat de gegevens kloppen. Pas dan kunnen teksten worden gegenereerd.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/woningen/${propertyId}/gegevens`}>
              Ingevuld formulier controleren <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/woningen/${propertyId}/bronnen`}>Bronnen en conflicten bekijken</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
