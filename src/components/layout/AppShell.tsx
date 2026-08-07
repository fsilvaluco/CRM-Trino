"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

const PUBLIC_PATHS = ["/login", "/auth/activate", "/forgot-password", "/reset-password"];
const PUBLIC_PREFIXES = ["/rate/", "/embed/", "/e/"];
const GUEST_ONLY_PATHS = ["/login", "/forgot-password"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  const isGuestOnly = GUEST_ONLY_PATHS.includes(pathname);
  // La raiz del dominio es especial: sin sesion muestra la landing publica
  // (sin chrome de la app), CON sesion muestra el Dashboard normal -- no
  // es "publica" en el sentido de las demas (login, etc.), porque su
  // contenido depende de si hay usuario o no.
  const isLandingRoot = pathname === "/";

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "true";
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!loading && !user && !isPublic && !isLandingRoot) {
      router.replace("/login");
      return;
    }

    if (!loading && user && isGuestOnly) {
      router.replace("/");
      return;
    }

    if (!loading && user && !isPublic && pathname !== "/auth/activate") {
      void (async () => {
        const { data: memberships } = await supabase
          .from("organization_members")
          .select("status")
          .eq("user_id", user.id)
          .limit(1);

        const hasPending = (memberships ?? []).some((m) => m.status === "pending");
        if (hasPending) {
          router.replace("/auth/activate");
        }
      })();
    }
  }, [user, loading, isPublic, isGuestOnly, isLandingRoot, pathname, router]);

  // El body no debe tener scroll propio mientras se muestra el shell
  // autenticado -- "main" es el UNICO contenedor que scrollea. Sin esto,
  // si algun contenido (ej. un Select/Popover mal posicionado) empuja el
  // documento mas alto que el viewport, aparece un segundo scrollbar a
  // nivel de pagina y el layout se corta raro. En paginas publicas (login,
  // etc.) no se toca, porque esas usan su propio min-h-screen sin este
  // shell.
  useEffect(() => {
    if (isPublic || (isLandingRoot && !user)) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isPublic, isLandingRoot, user]);

  // Página pública (login), o la raíz sin sesión (landing): solo renderiza
  // el children sin chrome.
  if (isPublic || (isLandingRoot && !user)) {
    return <>{children}</>;
  }

  // Cargando sesión inicial sin usuario conocido: spinner centrado
  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // No autenticado: no renderiza nada (el useEffect redirige)
  if (!user) return null;

  // Autenticado: layout completo con sidebar fijo y contenido aislado
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
