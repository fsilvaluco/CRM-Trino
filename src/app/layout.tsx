import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { LocaleProvider } from "@/lib/locale-context";
import { ThemeInitializer } from "@/components/layout/ThemeInitializer";
import { ServiceWorkerRegistrar } from "@/components/layout/ServiceWorkerRegistrar";
import { AuthProvider } from "@/lib/auth-context";
import { AppShell } from "@/components/layout/AppShell";
import { ProjectProvider } from "@/lib/project-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import { UpdateNotifier } from "@/components/layout/UpdateNotifier";

export const dynamic = "force-dynamic";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Artist Pro",
  description:
    "CRM conversacional con pipeline de ventas, clasificacion automatica de leads y seguimiento inteligente.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Artist Pro",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#14162B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Aplica el tema ANTES del primer pintado -- sin este script, el
            <html> siempre nace sin la clase "dark" y recien la agrega el
            useEffect de ThemeInitializer, que corre despues de hidratar.
            Eso genera un flash de tema claro en cada carga (casi siempre
            imperceptible, pero se nota en casos como imprimir, donde el
            estado que se captura es el de recien-cargado). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var raw=localStorage.getItem('user-prefs');var theme=raw?JSON.parse(raw).theme:'auto';var isDark=theme==='dark'||(theme!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(isDark)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex" suppressHydrationWarning>
        <TooltipProvider>
          <AuthProvider>
            <ProjectProvider>
              <NotificationsProvider>
              <LocaleProvider>
                <ThemeInitializer />
                <ServiceWorkerRegistrar />
                <AppShell>
                  {children}
                </AppShell>
                <Toaster />
                <UpdateNotifier />
              </LocaleProvider>
              </NotificationsProvider>
            </ProjectProvider>
          </AuthProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
