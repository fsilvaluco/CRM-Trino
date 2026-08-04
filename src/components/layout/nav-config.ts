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
  Disc3,
  ThumbsUp,
  Newspaper,
  Inbox,
  Plug,
  CreditCard,
  Mic2,
} from "lucide-react";
import { type LucideIcon } from "lucide-react";

export interface NavLeaf {
  type: "leaf";
  href: string;
  label: string;
  icon: LucideIcon;
  /** If set, this link only renders when the user satisfies the condition */
  adminOnly?: boolean;
  /** Si esta seteado, muestra un punto rojo cuando hay items nuevos sin ver en este modulo */
  moduleKey?: string;
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
      { type: "leaf", href: "/analytics/eventos", label: "Eventos", icon: Music },
      { type: "leaf", href: "/analytics/instagram", label: "Instagram", icon: Camera },
      { type: "leaf", href: "/analytics/spotify", label: "Spotify", icon: Disc3 },
      { type: "leaf", href: "/analytics/tiktok", label: "TikTok", icon: Music2 },
      { type: "leaf", href: "/analytics/youtube", label: "YouTube", icon: PlayCircle },
      { type: "leaf", href: "/analytics/facebook", label: "Facebook", icon: ThumbsUp },
      { type: "leaf", href: "/analytics/shopify", label: "Merch", icon: ShoppingBag },
      { type: "leaf", href: "/analytics/press", label: "Prensa", icon: Newspaper },
    ],
  },
  {
    type: "group",
    label: "CRM",
    icon: Briefcase,
    children: [
      { type: "leaf", href: "/crm", label: "Tratos", icon: Kanban, moduleKey: "deals" },
      { type: "leaf", href: "/contacts", label: "Contactos", icon: Users },
      { type: "leaf", href: "/companies", label: "Empresas", icon: Building2 },
      { type: "leaf", href: "/lead-candidates", label: "Bandeja de Leads", icon: Inbox, moduleKey: "lead_candidates" },
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
    href: "/eventos",
    label: "Eventos",
    icon: Mic2,
  },
  {
    type: "leaf",
    href: "/tasks",
    label: "Tareas",
    icon: CheckSquare,
    moduleKey: "tasks",
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
  {
    type: "leaf",
    href: "/settings/integrations",
    label: "Integraciones",
    icon: Plug,
  },
  {
    type: "leaf",
    href: "/settings/billing",
    label: "Facturación",
    icon: CreditCard,
    adminOnly: true,
  },
];

/**
 * Determina cuál href está "activo" para el pathname actual, usando la
 * coincidencia MÁS ESPECÍFICA (más larga) entre todos los hrefs del menú.
 *
 * Necesario porque un grupo como Métricas tiene un hijo cuyo href
 * ("/analytics") es prefijo de todos sus hermanos ("/analytics/instagram",
 * "/analytics/eventos", etc.) — con un simple `startsWith` ese hijo (Resumen)
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
