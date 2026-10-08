import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { requestPasswordReset } from "../actions";

export const metadata: Metadata = { title: "Wachtwoord vergeten" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h2 className="mb-1 text-lg font-semibold">Wachtwoord vergeten</h2>
      <p className="mb-6 text-sm text-muted-foreground">U ontvangt een link om een nieuw wachtwoord in te stellen.</p>
      <AuthForm
        action={requestPasswordReset}
        submitLabel="Herstellink versturen"
        fields={[{ name: "email", label: "E-mailadres", type: "email", autoComplete: "email" }]}
        footer={
          <Link href="/inloggen" className="block pt-1 text-center text-sm text-muted-foreground hover:text-foreground">
            Terug naar inloggen
          </Link>
        }
      />
    </>
  );
}
