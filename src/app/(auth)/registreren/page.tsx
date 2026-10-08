import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { signUp } from "../actions";

export const metadata: Metadata = { title: "Account activeren" };

export default function RegisterPage() {
  return (
    <>
      <h2 className="mb-1 text-lg font-semibold">Account activeren</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Alleen voor medewerkers die door een administrator zijn uitgenodigd. Gebruik het e-mailadres waarop u de uitnodiging ontving.
      </p>
      <AuthForm
        action={signUp}
        submitLabel="Account activeren"
        fields={[
          { name: "fullName", label: "Volledige naam", type: "text", autoComplete: "name" },
          { name: "email", label: "E-mailadres", type: "email", autoComplete: "email" },
          {
            name: "password",
            label: "Wachtwoord",
            type: "password",
            autoComplete: "new-password",
            hint: "Minimaal 12 tekens, met hoofdletter, kleine letter en cijfer.",
          },
        ]}
        footer={
          <Link href="/inloggen" className="block pt-1 text-center text-sm text-muted-foreground hover:text-foreground">
            Al een account? Inloggen
          </Link>
        }
      />
    </>
  );
}
