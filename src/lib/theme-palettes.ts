export type ThemeColorKey =
  | "verde"
  | "morado"
  | "rojo"
  | "naranjo"
  | "celeste"
  | "crema"
  | "azul"
  | "rosa";

export interface ThemePalette {
  key: ThemeColorKey;
  label: string;
  /** Color principal — botones, links, acentos */
  primary: string;
  /** Texto sobre el color principal (blanco salvo paletas muy claras) */
  primaryForeground: string;
  /** Variante para hover/anillo de foco */
  ring: string;
  /** Acento del sidebar (fondo oscuro fijo — solo cambia el detalle activo) */
  sidebarPrimary: string;
}

export const THEME_PALETTES: Record<ThemeColorKey, ThemePalette> = {
  verde: {
    key: "verde",
    label: "Verde",
    primary: "#22c55e",
    primaryForeground: "#ffffff",
    ring: "#22c55e",
    sidebarPrimary: "#22c55e",
  },
  morado: {
    key: "morado",
    label: "Morado",
    primary: "#a855f7",
    primaryForeground: "#ffffff",
    ring: "#a855f7",
    sidebarPrimary: "#a855f7",
  },
  rojo: {
    key: "rojo",
    label: "Rojo",
    primary: "#ef4444",
    primaryForeground: "#ffffff",
    ring: "#ef4444",
    sidebarPrimary: "#ef4444",
  },
  naranjo: {
    key: "naranjo",
    label: "Naranjo",
    primary: "#f97316",
    primaryForeground: "#ffffff",
    ring: "#f97316",
    sidebarPrimary: "#f97316",
  },
  celeste: {
    key: "celeste",
    label: "Celeste",
    primary: "#38bdf8",
    primaryForeground: "#ffffff",
    ring: "#38bdf8",
    sidebarPrimary: "#38bdf8",
  },
  crema: {
    key: "crema",
    label: "Crema",
    primary: "#d8c9a0",
    // Crema es la única paleta clara: texto oscuro para mantener contraste
    // legible sobre botones/badges (ver plan maestro 2.3).
    primaryForeground: "#4a3f2a",
    ring: "#c4b48a",
    sidebarPrimary: "#d8c9a0",
  },
  azul: {
    key: "azul",
    label: "Azul",
    primary: "#3b82f6",
    primaryForeground: "#ffffff",
    ring: "#3b82f6",
    sidebarPrimary: "#3b82f6",
  },
  rosa: {
    key: "rosa",
    label: "Rosa",
    primary: "#ec4899",
    primaryForeground: "#ffffff",
    ring: "#ec4899",
    sidebarPrimary: "#ec4899",
  },
};

export const THEME_COLOR_KEYS = Object.keys(THEME_PALETTES) as ThemeColorKey[];

export function isThemeColorKey(value: string | null | undefined): value is ThemeColorKey {
  return !!value && value in THEME_PALETTES;
}

/** Aplica la paleta como CSS custom properties sobre <html>. Idempotente. */
export function applyProjectThemeColor(themeColor: string | null | undefined) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const key = isThemeColorKey(themeColor) ? themeColor : "azul";
  const palette = THEME_PALETTES[key];

  root.style.setProperty("--primary", palette.primary);
  root.style.setProperty("--primary-foreground", palette.primaryForeground);
  root.style.setProperty("--ring", palette.ring);
  root.style.setProperty("--sidebar-primary", palette.sidebarPrimary);
  root.style.setProperty("--sidebar-ring", palette.ring);
}

/** Vuelve al azul por defecto — usar en "Todos los proyectos" o logout. */
export function resetProjectThemeColor() {
  applyProjectThemeColor("azul");
}
