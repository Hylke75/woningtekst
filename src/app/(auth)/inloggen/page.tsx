import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { signIn } from "../actions";
import { safeNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = { title: "Inloggen" };

const MELDINGEN: Record<string, string> = {
  uitgelogd: "U bent uitgelogd.",
  "link-ongeldig": "Deze link is ongeldig of verlopen. Vraag zo nodig een nieuwe link aan.",
};

export default async function LoginPage({ searchParams }: PageProps<"/inloggen">) {
  const params = await searchParams;
  const melding = typeof params.melding === "string" ? MELDINGEN[params.melding] : undefined;
  const next = safeNextPath(typeof params.volgende === "string" ? params.volgende : undefined);
  return (
    <>
      <h2 className="mb-1 text-lg font-semibold">Inloggen</h2>
      <p className="mb-6 text-sm text-muted-foreground">Log in met uw werkaccount.</p>
      <AuthForm
        action={signIn}
        notice={melding}
        hidden={{ next }}
        submitLabel="Inloggen"
        fields={[
          { name: "email", label: "E-mailadres", type: "email", autoComplete: "email" },
          { name: "password", label: "Wachtwoord", type: "password", autoComplete: "current-password" },
        ]}
        footer={
          <div className="flex items-center justify-between pt-1 text-sm">
            <Link href="/wachtwoord-vergeten" className="text-primary hover:underline">
              Wachtwoord vergeten?
            </Link>
            <Link href="/registreren" className="text-muted-foreground hover:text-foreground">
              Uitnodiging ontvangen?
            </Link>
          </div>
        }
      />
    </>
  );
}
