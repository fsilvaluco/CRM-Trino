"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProject } from "@/lib/project-context";
import { useAuth } from "@/lib/auth-context";
import { navConfig, settingsConfig, type NavLeaf, type NavGroup } from "./nav-config";

function isLeafActive(href: string, pathname: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

function LeafLink({ item, pathname, indent = false }: { item: NavLeaf; pathname: string; indent?: boolean }) {
  const active = isLeafActive(item.href, pathname);
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
    </Link>
  );
}

function GroupNav({ item, pathname }: { item: NavGroup; pathname: string }) {
  const groupActive = item.children.some((c) => isLeafActive(c.href, pathname));
  const [open, setOpen] = useState(groupActive);

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
            <LeafLink key={child.href} item={child} pathname={pathname} indent />
          ))}
        </div>
      )}
    </div>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  useProject(); // mantiene suscripción al contexto de proyecto
  const { orgRole } = useAuth();
  const isAdmin = orgRole === "owner" || orgRole === "admin";

  return (
    <div className="flex flex-col h-full bg-[var(--sidebar)] text-[var(--sidebar-foreground)]">
      <div className="flex h-16 items-center gap-2 px-6 border-b border-[var(--sidebar-border)]">
        <Briefcase className="h-6 w-6 text-[var(--sidebar-primary)]" />
        <span className="text-lg font-bold tracking-tight">Artist Pro</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navConfig.map((item) =>
          item.type === "group" ? (
            <GroupNav key={item.label} item={item} pathname={pathname} />
          ) : (
            <LeafLink key={item.href} item={item} pathname={pathname} />
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
              <LeafLink key={item.href} item={item} pathname={pathname} />
            ))}
          </>
        )}
      </nav>
    </div>
  );
}

