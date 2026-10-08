"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Bewust geen foutdetails of stacktrace tonen.
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold">Er ging iets mis</h1>
      <p className="mt-2 text-sm text-muted-foreground">De pagina kon niet worden geladen. Probeer het opnieuw; blijft het probleem bestaan, neem dan contact op met een administrator.</p>
      <Button className="mt-6" onClick={reset}>
        Opnieuw proberen
      </Button>
    </div>
  );
}
