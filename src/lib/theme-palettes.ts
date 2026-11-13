export type ThemeColorKey =
  | "verde"
  | "morado"
  | "rojo"
  | "naranjo"
  | "celeste"
  | "crema"
  | "azul"
  | "rosa";

/** Colores de interfaz para un modo (claro u oscuro). */
export interface ThemeUiColors {
  /** Fondo de botones/badges y color de links/acentos (--primary) */
  primary: string;
  /** Texto sobre `primary` (--primary-foreground) */
  primaryForeground: string;
}

export interface ThemePalette {
  key: ThemeColorKey;
  label: string;
  /**
   * Color de marca del proyecto: muestras del selector, barras del Gantt,
   * etiquetas de proyecto y acentos sobre el sidebar oscuro. NO se usa como
   * --primary de la interfaz porque varios tonos (verde, celeste, crema...)
   * no alcanzan contraste AA con texto blanco ni como texto sobre blanco.
   */
  primary: string;
  /** Texto sobre el color de marca (solo para las muestras de `primary`) */
  primaryForeground: string;
  /** Acento del sidebar (fondo oscuro fijo — solo cambia el detalle activo) */
  sidebarPrimary: string;
  /**
   * Colores de interfaz con contraste WCAG AA (>= 4.5:1) verificado:
   * - light: texto blanco sobre primary, y primary como texto sobre #fafafa/#fff.
   * - dark: texto #0f172a sobre primary, y primary como texto sobre la card #1e293b.
   */
  ui: { light: ThemeUiColors; dark: ThemeUiColors };
}

const INK = "#0f172a";

function ui(light: string, dark: string, darkForeground: string = INK) {
  return {
    light: { primary: light, primaryForeground: "#ffffff" },
    dark: { primary: dark, primaryForeground: darkForeground },
  };
}

export const THEME_PALETTES: Record<ThemeColorKey, ThemePalette> = {
  verde: {
    key: "verde",
    label: "Verde",
    primary: "#22c55e",
    primaryForeground: "#ffffff",
    sidebarPrimary: "#22c55e",
    ui: ui("#15803d", "#4ade80"),
  },
  morado: {
    key: "morado",
    label: "Morado",
    primary: "#a855f7",
    primaryForeground: "#ffffff",
    sidebarPrimary: "#a855f7",
    ui: ui("#9333ea", "#c084fc"),
  },
  rojo: {
    key: "rojo",
    label: "Rojo",
    primary: "#ef4444",
    primaryForeground: "#ffffff",
    sidebarPrimary: "#ef4444",
    ui: ui("#b91c1c", "#f87171"),
  },
  naranjo: {
    key: "naranjo",
    label: "Naranjo",
    primary: "#f97316",
    primaryForeground: "#ffffff",
    sidebarPrimary: "#f97316",
    ui: ui("#c2410c", "#fb923c"),
  },
  celeste: {
    key: "celeste",
    label: "Celeste",
    primary: "#38bdf8",
    primaryForeground: "#ffffff",
    sidebarPrimary: "#38bdf8",
    ui: ui("#0369a1", "#38bdf8"),
  },
  crema: {
    key: "crema",
    label: "Crema",
    primary: "#d8c9a0",
    // Crema es la única paleta clara: texto oscuro para mantener contraste
    // legible sobre botones/badges (ver plan maestro 2.3).
    primaryForeground: "#4a3f2a",
    sidebarPrimary: "#d8c9a0",
    ui: ui("#7a6a3f", "#d8c9a0", "#4a3f2a"),
  },
  azul: {
    key: "azul",
    label: "Azul",
    primary: "#3b82f6",
    primaryForeground: "#ffffff",
    sidebarPrimary: "#3b82f6",
    ui: ui("#2563eb", "#60a5fa"),
  },
  rosa: {
    key: "rosa",
    label: "Rosa",
    primary: "#ec4899",
    primaryForeground: "#ffffff",
    sidebarPrimary: "#ec4899",
    ui: ui("#be185d", "#f472b6"),
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

  // Se escriben variables --palette-*; globals.css las mapea a --primary/--ring
  // segun el modo (:root vs .dark). Asi la paleta respeta el modo oscuro, cosa
  // que no pasaba al escribir --primary directo en el style de <html>.
  root.style.setProperty("--palette-primary", palette.ui.light.primary);
  root.style.setProperty("--palette-primary-foreground", palette.ui.light.primaryForeground);
  root.style.setProperty("--palette-primary-dark", palette.ui.dark.primary);
  root.style.setProperty("--palette-primary-foreground-dark", palette.ui.dark.primaryForeground);
  root.style.setProperty("--sidebar-primary", palette.sidebarPrimary);
  root.style.setProperty("--sidebar-ring", palette.sidebarPrimary);
}

/** Vuelve al azul por defecto — usar en "Todos los proyectos" o logout. */
export function resetProjectThemeColor() {
  applyProjectThemeColor("azul");
}
