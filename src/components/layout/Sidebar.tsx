"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronRight, ChevronLeft, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { navConfig, settingsConfig, computeActiveHref, type NavLeaf, type NavGroup } from "./nav-config";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
              className={cn(baseClass, "justify-center px-2 py-2.5")}
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
    <Link
      href={item.href}
      className={cn(baseClass, "gap-3 px-3 py-2.5", indent && "pl-8")}
    >
      <item.icon className="h-5 w-5 shrink-0" />
      {item.label}
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
  const { orgRole } = useAuth();
  const isAdmin = orgRole === "owner" || orgRole === "admin";

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
        <Briefcase className="h-6 w-6 text-[var(--sidebar-primary)] shrink-0" />
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
              Artist Pro v2.0
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

