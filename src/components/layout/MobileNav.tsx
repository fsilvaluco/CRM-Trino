"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { THEME_PALETTES, type ThemeColorKey } from "@/lib/theme-palettes";
import { cn } from "@/lib/utils";
import { useProject } from "@/lib/project-context";
import { navConfig, settingsConfig, computeActiveHref, type NavLeaf, type NavGroup } from "./nav-config";
import { useNotifications } from "@/lib/notifications-context";

function LeafLink({ item, activeHref, indent = false }: { item: NavLeaf; activeHref: string; indent?: boolean }) {
  const { unseenCounts } = useNotifications();
  const hasUnseen = item.moduleKey ? (unseenCounts[item.moduleKey] ?? 0) > 0 : false;
  const active = item.href === activeHref;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
        indent && "pl-8",
        active
          ? "bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)]"
          : "text-[var(--sidebar-foreground)]/70 hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]"
      )}
    >
      <item.icon className="h-5 w-5 shrink-0" />
      {item.label}
      {hasUnseen && <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />}
    </Link>
  );
}

function GroupNav({ item, activeHref }: { item: NavGroup; activeHref: string }) {
  const groupActive = item.children.some((c) => c.href === activeHref);
  const [open, setOpen] = useState(groupActive);
  const [prevGroupActive, setPrevGroupActive] = useState(groupActive);

  if (groupActive !== prevGroupActive) {
    setPrevGroupActive(groupActive);
    if (groupActive) setOpen(true);
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
          groupActive
            ? "bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)]"
            : "text-[var(--sidebar-foreground)]/70 hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]"
        )}
      >
        <item.icon className="h-5 w-5 shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {item.children.map((child) => (
            <LeafLink key={child.href} item={child} activeHref={activeHref} indent />
          ))}
        </div>
      )}
    </div>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const activeHref = computeActiveHref(pathname);
  const { isAdmin, activeProject } = useProject(); // fuente unica de isAdmin, igual que Sidebar

  return (
    <div className="flex flex-col h-full bg-[var(--sidebar)] text-[var(--sidebar-foreground)]">
      <div className="flex h-16 items-center gap-2 px-6 border-b border-[var(--sidebar-border)]">
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
        <span className="text-lg font-bold tracking-tight">Artist Pro</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navConfig.map((item) =>
          item.type === "group" ? (
            <GroupNav key={item.label} item={item} activeHref={activeHref} />
          ) : (
            <LeafLink key={item.href} item={item} activeHref={activeHref} />
          )
        )}

        {isAdmin && (
          <>
            <div className="pt-3 pb-1 px-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--sidebar-foreground)]/40">
                Admin
              </p>
            </div>
            {settingsConfig.map((item) => (
              <LeafLink key={item.href} item={item} activeHref={activeHref} />
            ))}
          </>
        )}
      </nav>
    </div>
  );
}
