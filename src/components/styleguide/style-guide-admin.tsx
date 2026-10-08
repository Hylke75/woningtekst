"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownView } from "./markdown-view";
import { activateDefaultStyleGuide, activateStyleGuide, analyseExamples, publishStyleGuide } from "@/app/(app)/schrijfwijzer/actions";
import { newIdempotencyKey } from "@/lib/client-api";

export function ActivateDefaultButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await activateDefaultStyleGuide();
        setBusy(false);
        if (res.ok) {
          toast.success(`Schrijfwijzer versie ${res.data.version} is actief.`);
          router.refresh();
        } else toast.error(res.error.message);
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : null} Standaardschrijfwijzer activeren
    </Button>
  );
}

export function ActivateVersionButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await activateStyleGuide(id);
        setBusy(false);
        if (res.ok) {
          toast.success("Versie geactiveerd. Bestaande teksten zijn niet gewijzigd.");
          router.refresh();
        } else toast.error(res.error.message);
      }}
    >
      Activeren
    </Button>
  );
}

export function StyleGuideEditor({ initialTitle, initialContent, aiAvailable }: { initialTitle: string; initialContent: string; aiAvailable: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [tab, setTab] = useState("bewerken");
  const [, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [examples, setExamples] = useState("");
  const [key, setKey] = useState(() => newIdempotencyKey("sg"));

  async function publish() {
    setBusy("publish");
    const res = await publishStyleGuide({ title, content, changeNote: note });
    setBusy(null);
    if (res.ok) {
      toast.success(`Versie ${res.data.version} gepubliceerd en geactiveerd. Bestaande en goedgekeurde teksten zijn niet aangepast.`);
      setNote("");
      startTransition(() => router.refresh());
    } else toast.error(res.error.message);
  }

  async function analyse() {
    setBusy("analyse");
    const fd = new FormData();
    if (file) fd.set("bestand", file);
    fd.set("tekst", examples);
    fd.set("idempotencyKey", key);
    const res = await analyseExamples(fd);
    setBusy(null);
    if (res.ok) {
      setContent(res.data.voorstel);
      setAnalysis(res.data.analyse);
      setNote("Verbeterde versie op basis van analyse van voorbeeldteksten.");
      setTab("bewerken");
      setKey(newIdempotencyKey("sg"));
      toast.success("Voorstel klaar. Beoordeel en bewerk het voordat u publiceert.");
    } else toast.error(res.error.message);
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="bewerken">Bewerken</TabsTrigger>
          <TabsTrigger value="voorbeeld">Voorbeeld</TabsTrigger>
          <TabsTrigger value="analyseren">Voorbeelden analyseren</TabsTrigger>
        </TabsList>
        <TabsContent value="bewerken" className="mt-4 space-y-3">
          {analysis ? (
            <div className="rounded-lg border border-primary/20 bg-accent/40 px-4 py-3 text-sm">
              <p className="font-medium">Analyse van de voorbeelden</p>
              <p className="mt-1 whitespace-pre-line text-muted-foreground">{analysis}</p>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="sg-titel">Titel</Label>
            <Input id="sg-titel" value={title} onChange={(e) => setTitle(e.target.value)} className="bg-card" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sg-inhoud">Inhoud (Markdown)</Label>
            <Textarea id="sg-inhoud" value={content} onChange={(e) => setContent(e.target.value)} rows={24} className="bg-card font-mono text-[13px]" />
            <p className="text-xs text-muted-foreground">
              Standaardpassages staan tussen <code>&lt;!-- passage:naam --&gt;</code> en <code>&lt;!-- /passage --&gt;</code> en worden letterlijk overgenomen. Verboden formuleringen staan onder &ldquo;Te vermijden&rdquo;.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sg-notitie">Wat is er gewijzigd?</Label>
            <Input id="sg-notitie" value={note} onChange={(e) => setNote(e.target.value)} className="bg-card" placeholder="Bijv. clichélijst aangevuld" />
          </div>
          <Button onClick={() => void publish()} disabled={busy !== null || note.trim().length < 3}>
            {busy === "publish" ? <Loader2 className="animate-spin" /> : <Save />} Publiceren als nieuwe versie
          </Button>
        </TabsContent>
        <TabsContent value="voorbeeld" className="mt-4 rounded-xl border bg-card px-6 py-4">
          <MarkdownView markdown={content} />
        </TabsContent>
        <TabsContent value="analyseren" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload het document met voorbeeldomschrijvingen (bijv. <em>Korff-de-Gidts-woningomschrijvingen.docx</em>). Claude analyseert de structuur en stijl en stelt een verbeterde schrijfwijzer voor. Het bestand wordt niet opgeslagen; er wordt niets automatisch gepubliceerd.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="sg-bestand">Voorbeelddocument (DOCX, PDF of TXT, max. 4 MB)</Label>
            <Input id="sg-bestand" type="file" accept=".docx,.pdf,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="bg-card" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sg-plak">Of plak voorbeeldteksten</Label>
            <Textarea id="sg-plak" value={examples} onChange={(e) => setExamples(e.target.value)} rows={8} className="bg-card" />
          </div>
          <Button onClick={() => void analyse()} disabled={busy !== null || !aiAvailable || (!file && examples.trim().length < 500)}>
            {busy === "analyse" ? <Loader2 className="animate-spin" /> : file ? <FileUp /> : <Sparkles />} {busy === "analyse" ? "Bezig met analyseren…" : "Analyseren en voorstel maken"}
          </Button>
          {!aiAvailable ? <p className="text-xs text-warning">Claude is nog niet gekoppeld (ANTHROPIC_API_KEY ontbreekt).</p> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
