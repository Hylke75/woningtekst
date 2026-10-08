"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api, newIdempotencyKey } from "@/lib/client-api";

export function PastePanel({ propertyId, onDone }: { propertyId: string; onDone?: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => newIdempotencyKey("plak"));
  const [, startTransition] = useTransition();

  async function submit() {
    setBusy(true);
    const res = await api<{ summary: { facts: number; conflicts: number; applied: number } }>(`/api/woningen/${propertyId}/extractie`, {
      body: { idempotencyKey: key, source: { type: "text", text } },
    });
    setBusy(false);
    if (res.ok) {
      const { facts, conflicts, applied } = res.data.summary;
      toast.success(`${facts} gegevens gevonden${applied ? `, ${applied} velden voorgesteld` : ""}${conflicts ? `, ${conflicts} conflicten te beoordelen` : ""}.`);
      setText("");
      setKey(newIdempotencyKey("plak"));
      startTransition(() => router.refresh());
      onDone?.();
    } else {
      toast.error(res.error.message);
      if (!res.error.retryable) setKey(newIdempotencyKey("plak"));
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="plaktekst">Woningomschrijving of dossiertekst</Label>
        <Textarea
          id="plaktekst"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Plak hier een bestaande woningomschrijving, notities of tekst uit het verkoopdossier."
          className="bg-card"
          maxLength={100000}
        />
        <p className="text-xs text-muted-foreground">Namen, e-mailadressen, telefoonnummers en rekeningnummers van derden worden vóór verwerking gemaskeerd.</p>
      </div>
      <Button onClick={() => void submit()} disabled={busy || text.trim().length < 20}>
        {busy ? <Loader2 className="animate-spin" /> : <ScanSearch />}
        {busy ? "Bezig met analyseren…" : "Tekst analyseren"}
      </Button>
    </div>
  );
}
