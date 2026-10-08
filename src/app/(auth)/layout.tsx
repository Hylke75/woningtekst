export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">Korff de Gidts</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Woningtekst Studio</h1>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-[0_1px_2px_rgba(37,42,46,0.04)] sm:p-8">{children}</div>
        <p className="mt-6 text-center text-xs text-muted-foreground">Uitsluitend voor medewerkers van Korff de Gidts NVM Makelaardij.</p>
      </div>
    </main>
  );
}
