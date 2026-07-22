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
    type: "leaf",
    href: "/analytics",
    label: "Métricas",
    icon: BarChart2,
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
