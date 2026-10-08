import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Woningtekst Studio | Korff de Gidts", template: "%s | Woningtekst Studio" },
  description: "Interne applicatie van Korff de Gidts NVM Makelaardij voor het maken, vertalen en controleren van woningteksten.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nl" className={`${inter.variable} h-full`}>
      <body className="min-h-full">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
