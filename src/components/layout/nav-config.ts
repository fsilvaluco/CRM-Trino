import {
  LayoutDashboard,
  Users,
  Briefcase,
  CheckSquare,
  Building2,
  Megaphone,
  Wallet,
  Kanban,
  ShieldCheck,
  BarChart2,
  ClipboardList,
  Music,
  Camera,
  Music2,
  PlayCircle,
  ShoppingBag,
} from "lucide-react";
import { type LucideIcon } from "lucide-react";

export interface NavLeaf {
  type: "leaf";
  href: string;
  label: string;
  icon: LucideIcon;
  /** If set, this link only renders when the user satisfies the condition */
  adminOnly?: boolean;
}

export interface NavGroup {
  type: "group";
  label: string;
  icon: LucideIcon;
  /** The group is "active" when any child href matches the current path */
  children: NavLeaf[];
  adminOnly?: boolean;
}

export type NavItem = NavLeaf | NavGroup;

export const navConfig: NavItem[] = [
  {
    type: "leaf",
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    type: "group",
    label: "Métricas",
    icon: BarChart2,
    children: [
      { type: "leaf", href: "/analytics", label: "Resumen", icon: ClipboardList },
      { type: "leaf", href: "/analytics/shows", label: "Shows", icon: Music },
      { type: "leaf", href: "/analytics/instagram", label: "Instagram", icon: Camera },
      { type: "leaf", href: "/analytics/tiktok", label: "TikTok", icon: Music2 },
      { type: "leaf", href: "/analytics/youtube", label: "YouTube", icon: PlayCircle },
      { type: "leaf", href: "/analytics/shopify", label: "Merch", icon: ShoppingBag },
    ],
  },
  {
    type: "group",
    label: "CRM",
    icon: Briefcase,
    children: [
      { type: "leaf", href: "/crm", label: "Tratos", icon: Kanban },
      { type: "leaf", href: "/contacts", label: "Contactos", icon: Users },
      { type: "leaf", href: "/companies", label: "Empresas", icon: Building2 },
    ],
  },
  {
    type: "leaf",
    href: "/campanas",
    label: "Campañas",
    icon: Megaphone,
  },
  {
    type: "leaf",
    href: "/tasks",
    label: "Tareas",
    icon: CheckSquare,
  },
  {
    type: "leaf",
    href: "/finances",
    label: "Finanzas",
    icon: Wallet,
  },
];

/** Settings links — only rendered when role qualifies */
export const settingsConfig: NavLeaf[] = [
  {
    type: "leaf",
    href: "/settings/project",
    label: "Configuración",
    icon: Kanban,
    adminOnly: true,
  },
  {
    type: "leaf",
    href: "/settings/team",
    label: "Equipo y Acceso",
    icon: ShieldCheck,
    adminOnly: true,
  },
];

/**
 * Determina cuál href está "activo" para el pathname actual, usando la
 * coincidencia MÁS ESPECÍFICA (más larga) entre todos los hrefs del menú.
 *
 * Necesario porque un grupo como Métricas tiene un hijo cuyo href
 * ("/analytics") es prefijo de todos sus hermanos ("/analytics/instagram",
 * "/analytics/shows", etc.) — con un simple `startsWith` ese hijo (Resumen)
 * quedaría marcado como activo en cualquier subruta de Métricas, no solo
 * en la suya.
 */
export function computeActiveHref(pathname: string): string {
  const allHrefs: string[] = [];
  for (const item of navConfig) {
    if (item.type === "leaf") {
      allHrefs.push(item.href);
    } else {
      allHrefs.push(...item.children.map((c) => c.href));
    }
  }
  allHrefs.push(...settingsConfig.map((c) => c.href));

  let best: string | null = null;
  for (const href of allHrefs) {
    const matches = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
    if (matches && (best === null || href.length > best.length)) {
      best = href;
    }
  }
  return best ?? "";
}
