"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { archiveProperty, assignProperty, purgeProperty } from "@/app/(app)/woningen/actions";

export function AssignSelect({ propertyId, assignedTo, colleagues, disabled }: { propertyId: string; assignedTo: string | null; colleagues: { id: string; name: string }[]; disabled: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <Select
      value={assignedTo ?? undefined}
      disabled={disabled}
      onValueChange={async (v) => {
        const res = await assignProperty(propertyId, v);
        if (res.ok) toast.success("Verantwoordelijke gewijzigd.");
        else toast.error(res.error.message);
        startTransition(() => router.refresh());
      }}
    >
      <SelectTrigger className="w-full bg-card" aria-label="Verantwoordelijke medewerker">
        <SelectValue placeholder="Kies een medewerker" />
      </SelectTrigger>
      <SelectContent>
        {colleagues.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PropertyAdminActions({ propertyId, archived, canArchive, canPurge, documentCount }: { propertyId: string; archived: boolean; canArchive: boolean; canPurge: boolean; documentCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [, startTransition] = useTransition();
  if (!canArchive && !canPurge) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {canArchive ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await archiveProperty(propertyId, !archived);
            setBusy(false);
            if (res.ok) toast.success(archived ? "Woning teruggezet." : "Woning gearchiveerd.");
            else toast.error(res.error.message);
            startTransition(() => router.refresh());
          }}
        >
          {archived ? <ArchiveRestore /> : <Archive />} {archived ? "Terugzetten uit archief" : "Archiveren"}
        </Button>
      ) : null}
      {canPurge ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 /> Dossier definitief verwijderen
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Woningdossier definitief verwijderen?</AlertDialogTitle>
              <AlertDialogDescription>
                Dit verwijdert de woning, alle {documentCount} gekoppelde bestanden, brongegevens, tekstversies, controlepunten en generatietaken. Dit kan niet ongedaan worden
                gemaakt. Controleer vooraf of er geen wettelijke bewaarplicht geldt. In het auditlog blijft alleen vastgelegd dat het dossier is verwijderd en door wie.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="bevestig-verwijderen">Typ VERWIJDEREN ter bevestiging</Label>
              <Input id="bevestig-verwijderen" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuleren</AlertDialogCancel>
              <AlertDialogAction
                disabled={confirm.trim().toUpperCase() !== "VERWIJDEREN" || busy}
                onClick={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  const res = await purgeProperty(propertyId, confirm);
                  setBusy(false);
                  if (res && !res.ok) toast.error(res.error.message);
                }}
              >
                {busy ? <Loader2 className="animate-spin" /> : null} Definitief verwijderen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
