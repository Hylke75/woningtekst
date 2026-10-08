import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { setNewPassword } from "../actions";

export const metadata: Metadata = { title: "Nieuw wachtwoord" };

export default function SetPasswordPage() {
  return (
    <>
      <h2 className="mb-1 text-lg font-semibold">Nieuw wachtwoord instellen</h2>
      <p className="mb-6 text-sm text-muted-foreground">Minimaal 12 tekens, met hoofdletter, kleine letter en cijfer.</p>
      <AuthForm
        action={setNewPassword}
        submitLabel="Wachtwoord opslaan"
        fields={[
          { name: "password", label: "Nieuw wachtwoord", type: "password", autoComplete: "new-password" },
          { name: "confirm", label: "Herhaal wachtwoord", type: "password", autoComplete: "new-password" },
        ]}
      />
    </>
  );
}
