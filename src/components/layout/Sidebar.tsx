"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME_PALETTES, type ThemeColorKey } from "@/lib/theme-palettes";
import { useProject } from "@/lib/project-context";
import { useNotifications } from "@/lib/notifications-context";
import { navConfig, settingsConfig, computeActiveHref, type NavLeaf, type NavGroup } from "./nav-config";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { APP_VERSION } from "@/lib/constants";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

function LeafLink({
  item,
  activeHref,
  indent = false,
  collapsed,
}: {
  item: NavLeaf;
  activeHref: string;
  indent?: boolean;
  collapsed: boolean;
}) {
  const { unseenCounts } = useNotifications();
  const hasUnseen = item.moduleKey ? (unseenCounts[item.moduleKey] ?? 0) > 0 : false;
  const active = item.href === activeHref;
  const baseClass = cn(
    "flex items-center rounded-lg text-sm font-medium transition-colors cursor-pointer",
    active
      ? "bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)]"
      : "text-[var(--sidebar-foreground)]/70 hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]"
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href={item.href}
              className={cn(baseClass, "justify-center px-2 py-2.5 relative")}
            />
          }
        >
          <item.icon className="h-5 w-5 shrink-0" />
          {hasUnseen && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
          )}
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(baseClass, "gap-3 px-3 py-2.5", indent && "pl-8")}
    >
      <item.icon className="h-5 w-5 shrink-0" />
      {item.label}
      {hasUnseen && <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />}
    </Link>
  );
}

function GroupNav({
  item,
  activeHref,
  collapsed,
}: {
  item: NavGroup;
  activeHref: string;
  collapsed: boolean;
}) {
  const groupActive = item.children.some((c) => c.href === activeHref);
  const [open, setOpen] = useState(groupActive);
  const [prevGroupActive, setPrevGroupActive] = useState(groupActive);
  const firstChildHref = item.children[0]?.href ?? "/";

  // Autoexpande el grupo si un hijo pasa a estar activo por navegación
  // externa al sidebar. Ajuste durante el render (no en un efecto) —
  // patrón recomendado por React para sincronizar estado con props/derivados.
  if (groupActive !== prevGroupActive) {
    setPrevGroupActive(groupActive);
    if (groupActive) setOpen(true);
  }

  const activeClass = groupActive
    ? "bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)]"
    : "text-[var(--sidebar-foreground)]/70 hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]";

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href={firstChildHref}
              className={cn(
                "flex items-center justify-center rounded-lg px-2 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                activeClass
              )}
            />
          }
        >
          <item.icon className="h-5 w-5 shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
          activeClass
        )}
      >
        <item.icon className="h-5 w-5 shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {item.children.map((child) => (
            <LeafLink
              key={child.href}
              item={child}
              activeHref={activeHref}
              indent
              collapsed={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const activeHref = computeActiveHref(pathname);
  // Antes esto se calculaba por separado desde useAuth().orgRole (con su
  // propio cache en localStorage), lo que podia desincronizarse del
  // isAdmin real que usa el resto de la app (project-context) -- causando
  // que el menu mostrara "Admin" cuando en realidad los botones de
  // eliminar (que si usan project-context) lo ocultaban correctamente.
  // Ahora ambos usan exactamente la misma fuente.
  const { isAdmin, activeProject } = useProject();

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col flex-shrink-0 bg-[var(--sidebar)] text-[var(--sidebar-foreground)] h-screen transition-[width] duration-200 ease-in-out overflow-hidden",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Branding */}
      <div
        className={cn(
          "flex h-16 items-center border-b border-[var(--sidebar-border)] shrink-0",
          collapsed ? "justify-center" : "gap-2 px-6"
        )}
      >
        <span
          aria-label="Artist Pro"
          className="h-6 w-6 shrink-0"
          style={{
            backgroundColor:
              activeProject?.themeColor && activeProject.themeColor in THEME_PALETTES
                ? THEME_PALETTES[activeProject.themeColor as ThemeColorKey].primary
                : "var(--sidebar-primary)",
            WebkitMaskImage: "url(/logo-icon.png)",
            maskImage: "url(/logo-icon.png)",
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskPosition: "center",
          }}
        />
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight whitespace-nowrap">
            Artist Pro
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav
        className={cn(
          "flex-1 py-4 space-y-1 overflow-y-auto overflow-x-hidden",
          collapsed ? "px-2" : "px-3"
        )}
      >
        {navConfig.map((item) =>
          item.type === "group" ? (
            <GroupNav
              key={item.label}
              item={item}
              activeHref={activeHref}
              collapsed={collapsed}
            />
          ) : (
            <LeafLink
              key={(item as NavLeaf).href}
              item={item as NavLeaf}
              activeHref={activeHref}
              collapsed={collapsed}
            />
          )
        )}

        {isAdmin && (
          <>
            <div className={cn("pt-3 pb-1", collapsed ? "px-1" : "px-3")}>
              {collapsed ? (
                <div className="h-px bg-[var(--sidebar-border)]" />
              ) : (
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--sidebar-foreground)]/40">
                  Admin
                </p>
              )}
            </div>
            {settingsConfig.map((item) => (
              <LeafLink
                key={item.href}
                item={item}
                activeHref={activeHref}
                collapsed={collapsed}
              />
            ))}
          </>
        )}
      </nav>

      {/* Footer: version text + collapse toggle */}
      <div
        className={cn(
          "border-t border-[var(--sidebar-border)] shrink-0 flex items-center",
          collapsed ? "justify-center py-3" : "justify-between px-4 py-4"
        )}
      >
        {!collapsed && (
          <div>
            <p className="text-xs text-[var(--sidebar-foreground)]/50">
              Artist Pro v{APP_VERSION}
            </p>
          </div>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                onClick={onToggle}
                aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
                className="rounded-lg p-2 border border-[var(--sidebar-border)] bg-[var(--sidebar-accent)]/40 text-[var(--sidebar-foreground)]/70 hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)] hover:border-[var(--sidebar-primary)]/40 transition-colors cursor-pointer shadow-sm"
              />
            }
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? "Expandir" : "Colapsar"}
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}

