"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Loader2, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  cancelMfaEnrollment,
  confirmMfaEnrollment,
  removeMfaFactor,
  startMfaEnrollment,
  type MfaEnrollment,
} from "@/app/(app)/beveiliging/actions";

function groupSecret(secret: string) {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

export function MfaEnroll() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  if (!enrollment) {
    return (
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await startMfaEnrollment();
          setBusy(false);
          if (res.ok) setEnrollment(res.data);
          else toast.error(res.error.message);
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Twee-stapsverificatie instellen
      </Button>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await confirmMfaEnrollment({ factorId: enrollment.factorId, code });
        setBusy(false);
        if (!res.ok) {
          toast.error(res.error.message);
          return;
        }
        toast.success("Twee-stapsverificatie is ingesteld.");
        setEnrollment(null);
        setCode("");
        startTransition(() => router.refresh());
      }}
    >
      <ol className="list-decimal space-y-4 pl-5 text-sm">
        <li>
          Scan deze QR-code met een authenticator-app (bijv. Microsoft Authenticator, Google Authenticator of 1Password).
          {enrollment.qrCode ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URL van Supabase; next/image voegt niets toe
            <img src={enrollment.qrCode} alt="QR-code voor uw authenticator-app" width={176} height={176} className="mt-3 rounded-lg border bg-white p-2" />
          ) : null}
        </li>
        <li>
          Lukt scannen niet? Voer dan deze sleutel handmatig in:
          <code data-testid="mfa-secret" className="mt-2 block w-fit rounded-md bg-muted px-3 py-2 font-mono text-sm tracking-wider select-all">
            {groupSecret(enrollment.secret)}
          </code>
        </li>
        <li>
          <div className="space-y-1.5">
            <Label htmlFor="mfa-code">Vul de 6-cijferige code uit de app in</Label>
            <Input
              id="mfa-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              required
              className="h-10 w-40 bg-card font-mono tracking-widest"
            />
          </div>
        </li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null} Bevestigen
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            const id = enrollment.factorId;
            setEnrollment(null);
            setCode("");
            await cancelMfaEnrollment(id);
          }}
        >
          Annuleren
        </Button>
      </div>
    </form>
  );
}

export function MfaRemove({ factorId, canRemove, isAdmin }: { factorId: string; canRemove: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!canRemove}>
          <ShieldOff /> Uitschakelen
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Twee-stapsverificatie uitschakelen?</AlertDialogTitle>
          <AlertDialogDescription>
            Daarna is alleen uw wachtwoord nodig om in te loggen.
            {isAdmin ? " Als administrator kunt u beheerfuncties pas weer gebruiken nadat u opnieuw een authenticator-app heeft ingesteld." : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuleren</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              const res = await removeMfaFactor(factorId);
              setBusy(false);
              if (res.ok) toast.success("Twee-stapsverificatie is uitgeschakeld.");
              else toast.error(res.error.message);
              startTransition(() => router.refresh());
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : null} Uitschakelen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
