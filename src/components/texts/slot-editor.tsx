"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BadgeCheck,
  Check,
  ClipboardCopy,
  FileSearch,
  History,
  Loader2,
  RefreshCw,
  Save,
  Send,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/common/status-badge";
import { IssuesList } from "@/components/sources/issues-list";
import { EditorToolbar, RichEditorContent, useRichEditor } from "./rich-editor";
import { api, newIdempotencyKey } from "@/lib/client-api";
import { escapeHtml, htmlToPlainText, normalizeHashtags, wordCount } from "@/lib/content/html";
import { CHANNEL_SPECS } from "@/lib/content/validators";
import { CHANNEL_LABELS, CONTENT_SOURCE_LABELS, CONTENT_STATUS_LABELS, LANGUAGE_LABELS } from "@/lib/domain/labels";
import { formatDateTime } from "@/lib/format";
import type { Channel, ContentVersionRow, Language, ReviewIssueRow } from "@/lib/db-types";
import type { TextReviewOutput } from "@/lib/ai/schemas";
import { logCopy, restoreVersion, saveTextVersion, setTextStatus } from "@/app/(app)/woningen/[id]/teksten/actions";

type RewriteMode = "korter" | "uitgebreider" | "zakelijker" | "persoonlijker" | "natuurlijker";
const REWRITES: { mode: RewriteMode; label: string }[] = [
  { mode: "korter", label: "Korter" },
  { mode: "uitgebreider", label: "Uitgebreider" },
  { mode: "zakelijker", label: "Zakelijker" },
  { mode: "persoonlijker", label: "Persoonlijker" },
  { mode: "natuurlijker", label: "Natuurlijker" },
];

export type SlotPermissions = { edit: boolean; regenerate: boolean; submit: boolean; approve: boolean };

type PendingAction = { kind: "regenerate" } | { kind: "rewrite"; mode: RewriteMode } | { kind: "restore"; version: ContentVersionRow };

async function copy(text: string, what: string, versionId?: string, kind?: "tekst" | "hashtags" | "seo") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} gekopieerd.`);
    if (versionId && kind) void logCopy({ versionId, what: kind });
  } catch {
    toast.error("Kopiëren is niet gelukt. Selecteer de tekst handmatig.");
  }
}

export function SlotEditor({
  propertyId,
  channel,
  language,
  versions,
  issues,
  names,
  permissions,
  onDirtyChange,
  archived,
}: {
  propertyId: string;
  channel: Channel;
  language: Language;
  versions: ContentVersionRow[];
  issues: ReviewIssueRow[];
  names: Record<string, string>;
  permissions: SlotPermissions;
  onDirtyChange: (dirty: boolean) => void;
  archived: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const latest = versions[0];
  const savedHtml = latest?.content ?? "";
  const [html, setHtml] = useState(savedHtml);
  const [hashtags, setHashtags] = useState((latest?.hashtags ?? []).join(" "));
  const [seo, setSeo] = useState({ title: latest?.seo_title ?? "", meta: latest?.meta_description ?? "", slug: latest?.slug ?? "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingAction | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [preview, setPreview] = useState<ContentVersionRow | null>(null);
  const [review, setReview] = useState<TextReviewOutput | null>(null);
  const [instruction, setInstruction] = useState("");
  const editable = permissions.edit && !archived;
  // Basislijn = de door de editor genormaliseerde HTML van de opgeslagen versie.
  const [baseHtml, setBaseHtml] = useState<string | null>(null);
  const editor = useRichEditor(savedHtml, setHtml, editable, (normalized) => {
    setBaseHtml(normalized);
    setHtml(normalized);
  });
  const baseline = useRef({ hashtags: (latest?.hashtags ?? []).join(" "), seo: { title: latest?.seo_title ?? "", meta: latest?.meta_description ?? "", slug: latest?.slug ?? "" } });

  const dirty =
    (baseHtml !== null && html !== baseHtml && (latest ? true : htmlToPlainText(html).trim().length > 0)) ||
    hashtags.trim() !== baseline.current.hashtags.trim() ||
    seo.title !== baseline.current.seo.title ||
    seo.meta !== baseline.current.seo.meta ||
    seo.slug !== baseline.current.seo.slug;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const plain = useMemo(() => htmlToPlainText(html), [html]);
  const words = wordCount(plain);
  const spec = CHANNEL_SPECS[channel];
  const tagList = normalizeHashtags(hashtags.split(/[\s,]+/));
  const slotIssues = issues.filter((i) => i.content_version_id && versions.some((v) => v.id === i.content_version_id));

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function save() {
    if (!editor) return;
    setBusy("save");
    const res = await saveTextVersion({
      propertyId,
      channel,
      language,
      html: editor.getHTML(),
      expectedVersion: latest?.version_number ?? 0,
      basedOnVersionId: latest?.id ?? null,
      seoTitle: channel === "website" ? seo.title : null,
      metaDescription: channel === "website" ? seo.meta : null,
      slug: channel === "website" ? seo.slug : null,
      hashtags: tagList,
    });
    setBusy(null);
    if (res.ok) {
      toast.success(`Opgeslagen als versie ${res.data.version_number}.`);
      refresh();
    } else toast.error(res.error.message);
  }

  async function regenerate() {
    setBusy("regenerate");
    const res = await api<{ result: { versionNumber: number } }>(`/api/woningen/${propertyId}/teksten/hergenereer`, {
      body: { idempotencyKey: newIdempotencyKey("regen"), channel, language, expectedVersion: latest?.version_number ?? 0, instruction: instruction.trim() || undefined },
    });
    setBusy(null);
    if (res.ok) {
      toast.success(`Nieuwe tekst opgeslagen als versie ${res.data.result.versionNumber}.`);
      setInstruction("");
      refresh();
    } else toast.error(res.error.message);
  }

  async function rewrite(mode: RewriteMode) {
    setBusy(`rewrite-${mode}`);
    const res = await api<{ result: { versionNumber: number } }>(`/api/woningen/${propertyId}/teksten/herschrijf`, {
      body: { idempotencyKey: newIdempotencyKey("rw"), channel, language, mode, expectedVersion: latest?.version_number ?? null },
    });
    setBusy(null);
    if (res.ok) {
      toast.success(`Herschreven tekst opgeslagen als versie ${res.data.result.versionNumber}.`);
      refresh();
    } else toast.error(res.error.message);
  }

  async function restore(v: ContentVersionRow) {
    setBusy("restore");
    const res = await restoreVersion({ versionId: v.id, expectedVersion: latest?.version_number ?? 0 });
    setBusy(null);
    if (res.ok) {
      toast.success(`Versie ${v.version_number} hersteld als versie ${res.data.version_number}.`);
      setHistoryOpen(false);
      setPreview(null);
      refresh();
    } else toast.error(res.error.message);
  }

  async function runReview() {
    if (!editor) return;
    setBusy("review");
    const res = await api<{ result: TextReviewOutput }>(`/api/woningen/${propertyId}/teksten/controleer`, {
      body: { idempotencyKey: newIdempotencyKey("ctl"), channel, language, html: editor.getHTML() },
    });
    setBusy(null);
    if (res.ok) {
      setReview(res.data.result);
      if (!res.data.result.voorstellen.length) toast.success("Geen verbeterpunten gevonden.");
    } else toast.error(res.error.message);
  }

  function applySuggestion(index: number) {
    if (!editor || !review) return;
    const s = review.voorstellen[index];
    const current = editor.getHTML();
    const target = escapeHtml(s.origineel);
    const next = current.includes(target) ? current.replace(target, escapeHtml(s.voorstel)) : current.includes(s.origineel) ? current.replace(s.origineel, escapeHtml(s.voorstel)) : null;
    if (next === null) {
      toast.error("Dit fragment staat niet meer letterlijk in de tekst.");
      return;
    }
    editor.commands.setContent(next, { emitUpdate: true });
    setReview({ ...review, voorstellen: review.voorstellen.filter((_, i) => i !== index) });
    toast.success("Voorstel overgenomen. Vergeet niet op te slaan.");
  }

  function dismissSuggestion(index: number) {
    if (!review) return;
    setReview({ ...review, voorstellen: review.voorstellen.filter((_, i) => i !== index) });
  }

  async function changeStatus(status: "concept" | "ter_controle" | "goedgekeurd") {
    if (!latest) return;
    if (dirty) {
      toast.error("Sla uw wijzigingen eerst op.");
      return;
    }
    setBusy(`status-${status}`);
    const res = await setTextStatus({ versionId: latest.id, status });
    setBusy(null);
    if (res.ok) {
      toast.success(status === "goedgekeurd" ? "Tekst goedgekeurd." : status === "ter_controle" ? "Ter controle aangeboden." : "Teruggezet naar concept.");
      refresh();
    } else toast.error(res.error.message);
  }

  function guarded(action: PendingAction) {
    if (dirty) setConfirm(action);
    else void execute(action);
  }

  async function execute(action: PendingAction) {
    setConfirm(null);
    if (action.kind === "regenerate") await regenerate();
    else if (action.kind === "rewrite") await rewrite(action.mode);
    else await restore(action.version);
  }

  const label = `${CHANNEL_LABELS[channel]} ${LANGUAGE_LABELS[language].toLowerCase()}`;
  const anyBusy = busy !== null;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <h3 className="text-sm font-semibold">{label}</h3>
            {latest ? (
              <>
                <StatusBadge tone={latest.status === "goedgekeurd" ? "success" : latest.status === "ter_controle" ? "warning" : "neutral"}>
                  {CONTENT_STATUS_LABELS[latest.status]}
                </StatusBadge>
                <span className="text-xs text-muted-foreground">
                  v{latest.version_number} · {CONTENT_SOURCE_LABELS[latest.source]}
                  {latest.style_guide_version ? ` · schrijfwijzer v${latest.style_guide_version}` : ""}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Nog niet gegenereerd</span>
            )}
            {dirty ? <StatusBadge tone="warning">Niet opgeslagen</StatusBadge> : null}
            <span className={`ml-auto text-xs tabular-nums ${words && (words < spec.minWords || words > spec.maxWords) ? "text-warning" : "text-muted-foreground"}`}>
              {words} woorden · richtlijn {spec.minWords}–{spec.maxWords}
            </span>
          </div>
          <EditorToolbar editor={editor} disabled={!editable} />
          <RichEditorContent editor={editor} />
          <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2.5">
            <Button size="sm" variant="outline" onClick={() => void copy(plain, "Tekst", latest?.id, "tekst")} disabled={!plain}>
              <ClipboardCopy /> Kopiëren
            </Button>
            {editable ? (
              <Button size="sm" onClick={() => void save()} disabled={!dirty || anyBusy}>
                {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} Opslaan
              </Button>
            ) : null}
            {permissions.regenerate && !archived ? (
              <Button size="sm" variant="outline" onClick={() => guarded({ kind: "regenerate" })} disabled={anyBusy}>
                {busy === "regenerate" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Opnieuw genereren
              </Button>
            ) : null}
            {editable && latest ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={anyBusy}>
                    {busy?.startsWith("rewrite") ? <Loader2 className="animate-spin" /> : <Wand2 />} Herschrijven
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Laat Claude herschrijven</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {REWRITES.map((r) => (
                    <DropdownMenuItem key={r.mode} onSelect={() => guarded({ kind: "rewrite", mode: r.mode })}>
                      {r.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {editable ? (
              <Button size="sm" variant="outline" onClick={() => void runReview()} disabled={anyBusy || !plain}>
                {busy === "review" ? <Loader2 className="animate-spin" /> : <FileSearch />} Controleer deze tekst
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)} disabled={versions.length === 0}>
              <History /> Versies ({versions.length})
            </Button>
            {editable && versions.length > 1 ? (
              <Button size="sm" variant="ghost" onClick={() => guarded({ kind: "restore", version: versions[1] })} disabled={anyBusy}>
                <Undo2 /> Herstel vorige versie
              </Button>
            ) : null}
          </div>
        </div>

        {permissions.regenerate && !archived ? (
          <div className="space-y-1.5">
            <Label htmlFor={`instructie-${channel}-${language}`} className="text-xs text-muted-foreground">
              Optionele instructie bij opnieuw genereren
            </Label>
            <Input
              id={`instructie-${channel}-${language}`}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              maxLength={1000}
              placeholder="Bijv. leg meer nadruk op de tuin op het zuiden"
              className="bg-card"
            />
          </div>
        ) : null}

        {review ? (
          <section className="rounded-xl border bg-card" aria-labelledby={`review-${channel}-${language}`}>
            <header className="flex items-center justify-between border-b px-4 py-2.5">
              <h3 id={`review-${channel}-${language}`} className="text-sm font-semibold">
                Redactionele controle
              </h3>
              <Button size="icon-sm" variant="ghost" aria-label="Sluiten" onClick={() => setReview(null)}>
                <X />
              </Button>
            </header>
            <div className="space-y-3 px-4 py-3">
              <p className="text-sm text-muted-foreground">{review.oordeel}</p>
              {review.voorstellen.map((s, i) => (
                <div key={`${s.origineel}-${i}`} className="rounded-lg border px-3 py-2.5">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{s.categorie}</p>
                  <p className="mt-1 text-sm">
                    <span className="bg-destructive/10 line-through decoration-destructive/60">{s.origineel}</span>
                  </p>
                  <p className="mt-1 text-sm">
                    <span className="bg-success/10">{s.voorstel}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.reden}</p>
                  <div className="mt-2 flex gap-1.5">
                    <Button size="xs" onClick={() => applySuggestion(i)} disabled={!editable}>
                      <Check /> Accepteren
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => dismissSuggestion(i)}>
                      Negeren
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <aside className="space-y-4">
        {latest ? (
          <section className="rounded-xl border bg-card p-4" aria-label="Goedkeuring">
            <h3 className="text-sm font-semibold">Goedkeuring</h3>
            {latest.status === "goedgekeurd" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Goedgekeurd door {names[latest.approved_by ?? ""] ?? "onbekend"} op {formatDateTime(latest.approved_at)}.
              </p>
            ) : latest.status === "ter_controle" ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Ingediend door {names[latest.submitted_by ?? ""] ?? "onbekend"} op {formatDateTime(latest.submitted_at)}.
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Deze versie is nog een concept.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {permissions.submit && latest.status === "concept" && !archived ? (
                <Button size="sm" variant="outline" onClick={() => void changeStatus("ter_controle")} disabled={anyBusy}>
                  <Send /> Ter goedkeuring aanbieden
                </Button>
              ) : null}
              {permissions.approve && latest.status !== "goedgekeurd" && !archived ? (
                <Button size="sm" onClick={() => void changeStatus("goedgekeurd")} disabled={anyBusy}>
                  {busy === "status-goedgekeurd" ? <Loader2 className="animate-spin" /> : <BadgeCheck />} Goedkeuren
                </Button>
              ) : null}
              {permissions.approve && latest.status === "goedgekeurd" && !archived ? (
                <Button size="sm" variant="ghost" onClick={() => void changeStatus("concept")} disabled={anyBusy}>
                  Goedkeuring intrekken
                </Button>
              ) : null}
            </div>
          </section>
        ) : null}

        {channel === "website" ? (
          <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="SEO">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">SEO</h3>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => void copy(`SEO-titel: ${seo.title}\nMetaomschrijving: ${seo.meta}\nSlug: ${seo.slug}`, "SEO-gegevens", latest?.id, "seo")}
                disabled={!seo.title && !seo.meta}
              >
                <ClipboardCopy /> Alles kopiëren
              </Button>
            </div>
            <SeoField label="SEO-titel" value={seo.title} max={60} onChange={(v) => setSeo({ ...seo, title: v })} disabled={!editable} onCopy={() => void copy(seo.title, "SEO-titel", latest?.id, "seo")} />
            <SeoField label="Metaomschrijving" value={seo.meta} max={155} multiline onChange={(v) => setSeo({ ...seo, meta: v })} disabled={!editable} onCopy={() => void copy(seo.meta, "Metaomschrijving", latest?.id, "seo")} />
            <SeoField label="URL-slug" value={seo.slug} max={100} onChange={(v) => setSeo({ ...seo, slug: v })} disabled={!editable} onCopy={() => void copy(seo.slug, "Slug", latest?.id, "seo")} />
          </section>
        ) : null}

        <section className="space-y-2 rounded-xl border bg-card p-4" aria-label="Hashtags">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Hashtags</h3>
            <Button size="xs" variant="ghost" onClick={() => void copy(tagList.join(" "), "Hashtags", latest?.id, "hashtags")} disabled={!tagList.length}>
              <ClipboardCopy /> Kopiëren
            </Button>
          </div>
          <Textarea value={hashtags} onChange={(e) => setHashtags(e.target.value)} rows={3} disabled={!editable} className="bg-card text-sm" aria-label="Hashtags" />
          <p className="text-xs text-muted-foreground">
            {tagList.length} hashtags{channel === "funda" ? " · niet in de Funda-tekst zelf plaatsen" : ` · richtlijn ${spec.hashtags[0]}–${spec.hashtags[1]}`}
          </p>
        </section>

        <section className="space-y-2" aria-label="Controlepunten bij deze tekst">
          <h3 className="text-sm font-semibold">Controlepunten</h3>
          <IssuesList issues={slotIssues} emptyText="Geen openstaande controlepunten voor deze tekst." />
        </section>
      </aside>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Niet-opgeslagen wijzigingen</AlertDialogTitle>
            <AlertDialogDescription>
              U heeft wijzigingen die nog niet zijn opgeslagen. Als u doorgaat, wordt een nieuwe versie gemaakt en gaan deze wijzigingen verloren. Sla eerst op als u ze wilt bewaren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && void execute(confirm)}>Doorgaan zonder opslaan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Versiegeschiedenis — {label}</SheetTitle>
            <SheetDescription>Elke wijziging is een eigen versie. Herstellen maakt een nieuwe versie; er gaat niets verloren.</SheetDescription>
          </SheetHeader>
          <ol className="space-y-2 px-4 pb-6">
            {versions.map((v) => (
              <li key={v.id} className={`rounded-lg border p-3 ${preview?.id === v.id ? "border-primary/40 bg-accent/40" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">Versie {v.version_number}</span>
                  <StatusBadge tone={v.status === "goedgekeurd" ? "success" : v.status === "ter_controle" ? "warning" : "neutral"}>{CONTENT_STATUS_LABELS[v.status]}</StatusBadge>
                  <span className="text-xs text-muted-foreground">{CONTENT_SOURCE_LABELS[v.source]}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(v.created_at)} · {names[v.edited_by ?? v.generated_by ?? ""] ?? "onbekend"}
                  {v.style_guide_version ? ` · schrijfwijzer v${v.style_guide_version}` : ""}
                  {v.prompt_version ? ` · prompt ${v.prompt_version}` : ""}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <Button size="xs" variant="outline" onClick={() => setPreview(preview?.id === v.id ? null : v)}>
                    {preview?.id === v.id ? "Verbergen" : "Bekijken"}
                  </Button>
                  {editable && v.id !== latest?.id ? (
                    <Button size="xs" onClick={() => guarded({ kind: "restore", version: v })} disabled={anyBusy}>
                      <Undo2 /> Herstel deze versie
                    </Button>
                  ) : null}
                </div>
                {preview?.id === v.id ? (
                  <div className="prose-editor mt-3 max-h-96 overflow-y-auto rounded-md border bg-background px-3 py-2 text-sm" dangerouslySetInnerHTML={{ __html: v.content }} />
                ) : null}
              </li>
            ))}
          </ol>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SeoField({
  label,
  value,
  max,
  multiline,
  onChange,
  onCopy,
  disabled,
}: {
  label: string;
  value: string;
  max: number;
  multiline?: boolean;
  onChange: (v: string) => void;
  onCopy: () => void;
  disabled: boolean;
}) {
  const id = `seo-${label.replace(/\W/g, "")}`;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-xs">
          {label}
        </Label>
        <span className={`text-[11px] tabular-nums ${value.length > max ? "text-destructive" : "text-muted-foreground"}`}>
          {value.length}/{max}
          <button type="button" onClick={onCopy} className="ml-2 text-primary hover:underline" disabled={!value}>
            kopiëren
          </button>
        </span>
      </div>
      {multiline ? (
        <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={3} disabled={disabled} className="bg-card text-sm" />
      ) : (
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="bg-card text-sm" />
      )}
    </div>
  );
}
