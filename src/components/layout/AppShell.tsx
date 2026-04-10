"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { NotificationChecker } from "@/components/shared/NotificationChecker";

const PUBLIC_PATHS = ["/login"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (!loading && !user && !isPublic) {
      router.replace("/login");
    }
    if (!loading && user && isPublic) {
      router.replace("/");
    }
  }, [user, loading, isPublic, router]);

  // Página pública (login): solo renderiza el children sin chrome
  if (isPublic) {
    return <>{children}</>;
  }

  // Cargando sesión: spinner centrado
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // No autenticado: no renderiza nada (el useEffect redirige)
  if (!user) return null;

  // Autenticado: layout completo
  return (
    <>
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-4 md:p-6 bg-background overflow-auto">
          {children}
        </main>
      </div>
      <NotificationChecker />
    </>
  );
}
