import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { LocaleProvider } from "@/lib/locale-context";
import { ThemeInitializer } from "@/components/layout/ThemeInitializer";
import { AuthProvider } from "@/lib/auth-context";
import { AppShell } from "@/components/layout/AppShell";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Trino-Control",
  description:
    "CRM conversacional con pipeline de ventas, clasificacion automatica de leads y seguimiento inteligente.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex" suppressHydrationWarning>
        <TooltipProvider>
          <AuthProvider>
            <LocaleProvider>
              <ThemeInitializer />
              <AppShell>
                {children}
              </AppShell>
              <Toaster />
            </LocaleProvider>
          </AuthProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
