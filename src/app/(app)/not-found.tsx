import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold">Niet gevonden</h1>
      <p className="mt-2 text-sm text-muted-foreground">Deze pagina of woning bestaat niet, of u heeft er geen toegang toe.</p>
      <Button asChild className="mt-6" variant="outline">
        <Link href="/woningen">Naar woningen</Link>
      </Button>
    </div>
  );
}
