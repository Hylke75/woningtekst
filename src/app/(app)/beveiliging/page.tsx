import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { requirePageSession } from "@/lib/auth/session";
import { MFA_MESSAGES } from "@/lib/auth/mfa";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MfaEnroll, MfaRemove } from "@/components/security/mfa-settings";

export const metadata: Metadata = { title: "Beveiliging" };

export default async function SecurityPage({ searchParams }: PageProps<"/beveiliging">) {
  const session = await requirePageSession();
  const params = await searchParams;
  const supabase = await createClient();
  // listFactors haalt de gebruiker op bij de Auth-server (gezaghebbend).
  const { data } = await supabase.auth.mfa.listFactors();
  const factor = data?.totp[0] ?? null;
  const isAdmin = session.role === "admin";
  const aal2 = session.mfa.currentLevel === "aal2";

  return (
    <>
      <PageHeader title="Beveiliging" description="Twee-stapsverificatie voor uw account" />
      <div className="max-w-2xl space-y-6">
        {params.melding === "mfa-vereist" && !factor ? (
          <Alert className="border-warning/40 bg-warning/5">
            <AlertDescription className="text-foreground">{MFA_MESSAGES.inschrijving_nodig}</AlertDescription>
          </Alert>
        ) : null}

        <section className="rounded-xl border bg-card">
          <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">Twee-stapsverificatie (authenticator-app)</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Bij het inloggen vraagt Woningtekst Studio naast uw wachtwoord een code uit een app op uw telefoon.
                {isAdmin ? " Voor administrators is dit verplicht om beheerfuncties te gebruiken." : ""}
              </p>
            </div>
            {factor ? <StatusBadge tone="success">Aan</StatusBadge> : <StatusBadge tone="neutral">Uit</StatusBadge>}
          </header>
          <div className="px-5 py-5">
            {factor ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3 text-sm">
                  <ShieldCheck className="mt-0.5 size-5 text-success" aria-hidden />
                  <div>
                    <p className="font-medium">{factor.friendly_name || "Authenticator-app"}</p>
                    <p className="text-muted-foreground">Ingesteld op {formatDateTime(factor.created_at)}</p>
                  </div>
                </div>
                <div className="space-y-1 sm:text-right">
                  <MfaRemove factorId={factor.id} canRemove={aal2} isAdmin={isAdmin} />
                  {!aal2 ? <p className="text-xs text-muted-foreground">Log opnieuw in met uw code om dit uit te schakelen.</p> : null}
                </div>
              </div>
            ) : (
              <MfaEnroll />
            )}
          </div>
        </section>
        <p className="text-xs text-muted-foreground">
          Telefoon kwijt of nieuwe telefoon zonder overgezette app? Neem contact op met de applicatiebeheerder; die kan de koppeling verwijderen zodat u opnieuw kunt instellen.
        </p>
      </div>
    </>
  );
}
