"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { setDataChecked } from "@/app/(app)/woningen/actions";
import { formatDateTime } from "@/lib/format";

export function DataCheckCard({
  propertyId,
  checkedAt,
  conflicts,
  unverified,
  canEdit,
}: {
  propertyId: string;
  checkedAt: string | null;
  conflicts: number;
  unverified: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(Boolean(checkedAt));
  const [, startTransition] = useTransition();
  const blocked = conflicts > 0;
  return (
    <div className={`rounded-xl border px-4 py-3.5 ${checked ? "border-success/30 bg-success/5" : "bg-card"}`}>
      <div className="flex items-start gap-3">
        {checkedAt ? <CheckCircle2 className="mt-0.5 size-5 text-success" /> : <ShieldCheck className="mt-0.5 size-5 text-muted-foreground" />}
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <Checkbox
              id="gecontroleerd"
              checked={checked}
              disabled={!canEdit || busy || (blocked && !checked)}
              onCheckedChange={async (c) => {
                const next = c === true;
                setChecked(next);
                setBusy(true);
                const res = await setDataChecked(propertyId, next);
                setBusy(false);
                if (!res.ok) {
                  setChecked(!next);
                  toast.error(res.error.message);
                }
                startTransition(() => router.refresh());
              }}
            />
            <Label htmlFor="gecontroleerd" className="text-sm font-medium">
              Ik heb de woninggegevens gecontroleerd
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            {checkedAt
              ? `Gecontroleerd op ${formatDateTime(checkedAt)}. Elke wijziging in de gegevens vraagt om een nieuwe controle.`
              : blocked
                ? `Beoordeel eerst ${conflicts} conflicterend${conflicts === 1 ? " gegeven" : "e gegevens"} onder Bronnen en controle.`
                : unverified > 0
                  ? `${unverified} door AI voorgestelde gegevens zijn nog niet bevestigd. Controleer ze voordat u teksten laat genereren.`
                  : "Tekstgeneratie start pas nadat een medewerker de gegevens heeft gecontroleerd."}
          </p>
        </div>
      </div>
    </div>
  );
}
