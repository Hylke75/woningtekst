"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, FileText, ImageIcon, Loader2, ScanSearch, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatusBadge, type Tone } from "@/components/common/status-badge";
import { createClient } from "@/lib/supabase/client";
import { api, newIdempotencyKey } from "@/lib/client-api";
import { DOCUMENT_TYPE_LABELS, EXTRACTION_STATUS_LABELS } from "@/lib/domain/labels";
import { ACCEPT_ATTRIBUTE } from "@/lib/documents/validate";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { DocumentRow, DocumentType, ExtractionStatus } from "@/lib/db-types";

const STATUS_TONE: Record<ExtractionStatus, Tone> = {
  niet_gestart: "neutral",
  bezig: "primary",
  voltooid: "success",
  mislukt: "danger",
  niet_van_toepassing: "neutral",
};

function guessType(file: File): DocumentType {
  const n = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return /plattegrond|floor|plan/.test(n) ? "plattegrond" : /label/.test(n) ? "energielabel" : "foto";
  if (/meet|nen/.test(n)) return "meetrapport";
  if (/vve|mjop|splitsing/.test(n)) return "vve_document";
  if (/label/.test(n)) return "energielabel";
  if (/omschrijving|tekst|funda/.test(n)) return "originele_omschrijving";
  if (/dossier|vragenlijst|lijst van zaken|koop/.test(n)) return "verkoopdossier";
  return "overig";
}

export function DocumentsPanel({
  propertyId,
  documents,
  canUpload,
  canAnalyse,
  compact = false,
}: {
  propertyId: string;
  documents: DocumentRow[];
  canUpload: boolean;
  canAnalyse: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<DocumentType | "auto">("auto");
  const [busy, setBusy] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [, startTransition] = useTransition();

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    const supabase = createClient();
    let ok = 0;
    for (const [i, file] of list.entries()) {
      setBusy(`Uploaden ${i + 1} van ${list.length}: ${file.name}`);
      const mimeType = file.type || (file.name.toLowerCase().endsWith(".txt") ? "text/plain" : "");
      const signed = await api<{ path: string; token: string }>(`/api/woningen/${propertyId}/documenten/upload-url`, {
        body: { filename: file.name, size: file.size, mimeType },
      });
      if (!signed.ok) {
        toast.error(`${file.name}: ${signed.error.message}`);
        continue;
      }
      const { error } = await supabase.storage.from("property-documents").uploadToSignedUrl(signed.data.path, signed.data.token, file, { contentType: mimeType });
      if (error) {
        toast.error(`${file.name}: uploaden mislukt.`);
        continue;
      }
      const done = await api<{ document: DocumentRow }>(`/api/woningen/${propertyId}/documenten`, {
        body: { path: signed.data.path, filename: file.name, mimeType, documentType: uploadType === "auto" ? guessType(file) : uploadType },
      });
      if (!done.ok) {
        toast.error(`${file.name}: ${done.error.message}`);
        continue;
      }
      ok++;
    }
    setBusy(null);
    if (inputRef.current) inputRef.current.value = "";
    if (ok) toast.success(ok === 1 ? "Document toegevoegd." : `${ok} documenten toegevoegd.`);
    startTransition(() => router.refresh());
  }

  async function analyse(doc: DocumentRow) {
    setAnalysing((s) => new Set(s).add(doc.id));
    const res = await api<{ summary: { facts: number; conflicts: number; applied: number } }>(`/api/woningen/${propertyId}/extractie`, {
      body: { idempotencyKey: newIdempotencyKey("ex"), source: { type: "document", documentId: doc.id } },
    });
    setAnalysing((s) => {
      const n = new Set(s);
      n.delete(doc.id);
      return n;
    });
    if (res.ok) {
      const { facts, conflicts, applied } = res.data.summary;
      toast.success(`${facts} gegevens gevonden${applied ? `, ${applied} lege velden voorgesteld` : ""}${conflicts ? `, ${conflicts} conflicten te beoordelen` : ""}.`);
    } else {
      toast.error(res.error.message);
    }
    startTransition(() => router.refresh());
  }

  async function remove(doc: DocumentRow) {
    const res = await api(`/api/documenten/${doc.id}`, { method: "DELETE" });
    if (res.ok) toast.success("Document verwijderd.");
    else toast.error(res.error.message);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {canUpload ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!busy) void uploadFiles(e.dataTransfer.files);
          }}
          className={`rounded-xl border border-dashed px-4 py-5 transition-colors ${dragOver ? "border-primary bg-accent/60" : "bg-muted/30"}`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-sm font-medium">Sleep bestanden hierheen of kies bestanden</p>
              <p className="text-xs text-muted-foreground">PDF, DOCX, TXT, JPG, PNG of WEBP. Bestanden worden privé opgeslagen.</p>
            </div>
            <Select value={uploadType} onValueChange={(v) => setUploadType(v as DocumentType | "auto")}>
              <SelectTrigger className="w-full bg-card sm:w-56" aria-label="Documenttype">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Type automatisch bepalen</SelectItem>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input ref={inputRef} type="file" multiple accept={ACCEPT_ATTRIBUTE} className="sr-only" id={`upload-${propertyId}`} onChange={(e) => e.target.files && void uploadFiles(e.target.files)} />
            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => inputRef.current?.click()}>
              {busy ? <Loader2 className="animate-spin" /> : <Upload />} Bestanden kiezen
            </Button>
          </div>
          {busy ? (
            <p className="mt-3 text-xs text-muted-foreground" role="status">
              {busy}
            </p>
          ) : null}
        </div>
      ) : null}

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Er zijn nog geen documenten aan deze woning gekoppeld.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card" aria-label="Gekoppelde documenten">
          {documents.map((doc) => {
            const isImage = doc.mime_type.startsWith("image/");
            const running = analysing.has(doc.id) || doc.extraction_status === "bezig";
            return (
              <li key={doc.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="mt-0.5 text-muted-foreground">{isImage ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{doc.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {DOCUMENT_TYPE_LABELS[doc.document_type]} · {formatBytes(doc.file_size)}
                      {compact ? "" : ` · ${formatDateTime(doc.created_at)}`}
                    </p>
                    {doc.extraction_status === "mislukt" && doc.extraction_error ? <p className="mt-0.5 text-xs text-destructive">{doc.extraction_error}</p> : null}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 pl-7 sm:pl-0">
                  <StatusBadge tone={running ? "primary" : STATUS_TONE[doc.extraction_status]}>{running ? "Wordt geanalyseerd" : EXTRACTION_STATUS_LABELS[doc.extraction_status]}</StatusBadge>
                  {canAnalyse ? (
                    <Button type="button" size="sm" variant="ghost" disabled={running} onClick={() => void analyse(doc)}>
                      {running ? <Loader2 className="animate-spin" /> : <ScanSearch />}
                      {doc.extraction_status === "voltooid" ? "Opnieuw" : "Analyseren"}
                    </Button>
                  ) : null}
                  <Button asChild size="icon-sm" variant="ghost" aria-label={`${doc.filename} downloaden`}>
                    <a href={`/api/documenten/${doc.id}/download`} target="_blank" rel="noopener noreferrer">
                      <Download />
                    </a>
                  </Button>
                  {canUpload ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon-sm" variant="ghost" aria-label={`${doc.filename} verwijderen`}>
                          <Trash2 />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Document verwijderen?</AlertDialogTitle>
                          <AlertDialogDescription>
                            &ldquo;{doc.filename}&rdquo; wordt definitief verwijderd, inclusief de gegevens die uit dit document zijn gehaald. Woninggegevens die u al heeft overgenomen blijven staan.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuleren</AlertDialogCancel>
                          <AlertDialogAction onClick={() => void remove(doc)}>Verwijderen</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
