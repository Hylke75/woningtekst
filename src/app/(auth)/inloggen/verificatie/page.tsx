import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getSession } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/redirect";
import { signOut, verifyMfaLogin } from "../../actions";

export const metadata: Metadata = { title: "Verificatie" };

export default async function MfaVerifyPage({ searchParams }: PageProps<"/inloggen/verificatie">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.volgende === "string" ? params.volgende : undefined);
  const session = await getSession();
  if (!session) redirect(`/inloggen?volgende=${encodeURIComponent(next)}`);
  // Al geverifieerd of geen factor ingesteld: niets te doen.
  if (session.mfa.currentLevel === "aal2" || !session.mfa.hasVerifiedFactor) redirect(next);

  return (
    <>
      <h2 className="mb-1 text-lg font-semibold">Twee-stapsverificatie</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Open de authenticator-app op uw telefoon en vul de 6-cijferige code in voor Woningtekst Studio.
      </p>
      <AuthForm
        action={verifyMfaLogin}
        hidden={{ next }}
        submitLabel="Bevestigen"
        fields={[
          {
            name: "code",
            label: "Verificatiecode",
            type: "text",
            autoComplete: "one-time-code",
            inputMode: "numeric",
            pattern: "[0-9]{6}",
            maxLength: 6,
            autoFocus: true,
          },
        ]}
        footer={
          <div className="space-y-3 pt-1 text-sm">
            <p className="text-xs text-muted-foreground">
              Geen toegang tot uw authenticator-app? Neem contact op met de applicatiebeheerder van Korff de Gidts.
            </p>
          </div>
        }
      />
      <form action={signOut} className="mt-4 text-center">
        <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
          Uitloggen en ander account gebruiken
        </button>
      </form>
    </>
  );
}
