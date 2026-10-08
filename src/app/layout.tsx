import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Woningtekst Studio | Korff de Gidts", template: "%s | Woningtekst Studio" },
  description: "Interne applicatie van Korff de Gidts NVM Makelaardij voor het maken, vertalen en controleren van woningteksten.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // CSP-nonces werken alleen bij dynamisch renderen: de nonce wordt per verzoek
  // in de proxy gemaakt en door Next.js tijdens het renderen op scripts gezet.
  // Hiermee rendert elke pagina per verzoek (geen statische prerender zonder nonce).
  await connection();
  return (
    <html lang="nl" className={`${inter.variable} h-full`}>
      <body className="min-h-full">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
