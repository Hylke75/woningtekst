import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Geen toegang" };

export default async function NoAccessPage() {
  const session = await getSession();
  if (!session) redirect("/inloggen");
  if (session.organizationId) redirect("/dashboard");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-xl border bg-card p-8 text-center">
        <h1 className="text-lg font-semibold">Nog geen toegang</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Uw account ({session.email}) is nog niet aan Korff de Gidts gekoppeld of is gedeactiveerd. Vraag een administrator om u uit te nodigen
          met dit e-mailadres.
        </p>
        <form action={signOut} className="mt-6">
          <Button variant="outline" type="submit">
            Uitloggen
          </Button>
        </form>
      </div>
    </main>
  );
}
