"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart2, Mic2, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const MOBILE_TABS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/eventos", label: "Eventos", icon: Mic2 },
  { href: "/tasks", label: "Tareas", icon: CheckSquare },
  { href: "/analytics", label: "Métricas", icon: BarChart2 },
];

// Barra de accesos rapidos solo en celular -- el sidebar de escritorio es
// mal patron en mobile (dos toques via hamburguesa). Se eligieron a
// proposito los 4 modulos que se usan de verdad desde el celular en el
// dia a dia (Dashboard, Eventos, Tareas, Metricas) -- el CRM se dejo
// afuera porque el trabajo ahi (Kanban, formularios largos) es mas comodo
// en escritorio.
export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="no-print md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch bg-card border-t"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {MOBILE_TABS.map(({ href, label, icon: Icon }) => {
        const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px]",
              isActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
