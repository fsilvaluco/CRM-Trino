// Catalogo de temas de color para la pagina publica del smartlink
// (/s/[slug]). Cada lanzamiento tiene su propia estetica y un fondo unico
// pelea con la caratula, asi que el smartlink guarda una CLAVE de este
// catalogo (columna smartlinks.theme) en vez de colores sueltos: el
// contraste queda garantizado y sumar un tema es solo agregar una entrada.
//
// Los valores se inyectan como CSS variables en el root de la pagina y las
// clases Tailwind las consumen con `bg-[var(--sl-bg)]` etc. -- ver
// smartlinkThemeStyle().

export interface SmartlinkTheme {
  key: string;
  label: string;
  /** Fondo de la pagina */
  bg: string;
  /** Texto principal (titulo) */
  fg: string;
  /** Texto secundario (artista) */
  fgMuted: string;
  /** Texto terciario (pie "Artist Pro") */
  fgFaint: string;
  /** Superficie elevada (placeholder de caratula, chips) */
  surface: string;
  /** Boton de plataforma */
  btnBg: string;
  btnFg: string;
  /** Chevron del boton */
  btnFgFaint: string;
  /** Anillo del boton destacado */
  accent: string;
  /** Etiqueta "Recomendado" del boton destacado */
  accentSoftBg: string;
  accentSoftFg: string;
}

export const DEFAULT_SMARTLINK_THEME = "navy";

// Todos los oscuros usan boton blanco (lo que mejor convierte sobre fondo
// oscuro y lo que ya venia usando el smartlink original). El unico claro
// invierte: fondo casi blanco, botones navy.
export const SMARTLINK_THEMES: SmartlinkTheme[] = [
  {
    key: "navy",
    label: "Navy",
    bg: "#14162B",
    fg: "#ffffff",
    fgMuted: "rgba(255,255,255,0.6)",
    fgFaint: "rgba(255,255,255,0.3)",
    surface: "rgba(255,255,255,0.1)",
    btnBg: "#ffffff",
    btnFg: "#14162B",
    btnFgFaint: "rgba(20,22,43,0.4)",
    accent: "#6366f1",
    accentSoftBg: "#e0e7ff",
    accentSoftFg: "#4338ca",
  },
  {
    key: "negro",
    label: "Negro",
    bg: "#0a0a0a",
    fg: "#ffffff",
    fgMuted: "rgba(255,255,255,0.6)",
    fgFaint: "rgba(255,255,255,0.3)",
    surface: "rgba(255,255,255,0.1)",
    btnBg: "#ffffff",
    btnFg: "#0a0a0a",
    btnFgFaint: "rgba(10,10,10,0.4)",
    accent: "#f0653d",
    accentSoftBg: "#ffedd5",
    accentSoftFg: "#c2410c",
  },
  {
    key: "rojo",
    label: "Rojo",
    bg: "#9f1239",
    fg: "#ffffff",
    fgMuted: "rgba(255,255,255,0.7)",
    fgFaint: "rgba(255,255,255,0.4)",
    surface: "rgba(255,255,255,0.12)",
    btnBg: "#ffffff",
    btnFg: "#881337",
    btnFgFaint: "rgba(136,19,55,0.4)",
    accent: "#fda4af",
    accentSoftBg: "#ffe4e6",
    accentSoftFg: "#9f1239",
  },
  {
    key: "verde",
    label: "Verde",
    bg: "#14532d",
    fg: "#ffffff",
    fgMuted: "rgba(255,255,255,0.7)",
    fgFaint: "rgba(255,255,255,0.4)",
    surface: "rgba(255,255,255,0.12)",
    btnBg: "#ffffff",
    btnFg: "#14532d",
    btnFgFaint: "rgba(20,83,45,0.4)",
    accent: "#4ade80",
    accentSoftBg: "#dcfce7",
    accentSoftFg: "#15803d",
  },
  {
    key: "violeta",
    label: "Violeta",
    bg: "#3b0764",
    fg: "#ffffff",
    fgMuted: "rgba(255,255,255,0.65)",
    fgFaint: "rgba(255,255,255,0.35)",
    surface: "rgba(255,255,255,0.12)",
    btnBg: "#ffffff",
    btnFg: "#3b0764",
    btnFgFaint: "rgba(59,7,100,0.4)",
    accent: "#c084fc",
    accentSoftBg: "#f3e8ff",
    accentSoftFg: "#7e22ce",
  },
  {
    key: "naranja",
    label: "Naranja",
    bg: "#7c2d12",
    fg: "#ffffff",
    fgMuted: "rgba(255,255,255,0.7)",
    fgFaint: "rgba(255,255,255,0.4)",
    surface: "rgba(255,255,255,0.12)",
    btnBg: "#ffffff",
    btnFg: "#7c2d12",
    btnFgFaint: "rgba(124,45,18,0.4)",
    accent: "#fb923c",
    accentSoftBg: "#ffedd5",
    accentSoftFg: "#c2410c",
  },
  {
    key: "azul",
    label: "Azul",
    bg: "#1e3a8a",
    fg: "#ffffff",
    fgMuted: "rgba(255,255,255,0.7)",
    fgFaint: "rgba(255,255,255,0.4)",
    surface: "rgba(255,255,255,0.12)",
    btnBg: "#ffffff",
    btnFg: "#1e3a8a",
    btnFgFaint: "rgba(30,58,138,0.4)",
    accent: "#60a5fa",
    accentSoftBg: "#dbeafe",
    accentSoftFg: "#1d4ed8",
  },
  {
    key: "claro",
    label: "Claro",
    bg: "#fafafa",
    fg: "#0f172a",
    fgMuted: "#64748b",
    fgFaint: "#94a3b8",
    surface: "#e2e8f0",
    btnBg: "#0f172a",
    btnFg: "#ffffff",
    btnFgFaint: "rgba(255,255,255,0.45)",
    accent: "#4338ca",
    accentSoftBg: "#e0e7ff",
    accentSoftFg: "#4338ca",
  },
];

export function isSmartlinkThemeKey(value: unknown): value is string {
  return typeof value === "string" && SMARTLINK_THEMES.some((t) => t.key === value);
}

export function getSmartlinkTheme(key: string | null | undefined): SmartlinkTheme {
  return SMARTLINK_THEMES.find((t) => t.key === key) ?? SMARTLINK_THEMES[0];
}

/** CSS variables del tema, para poner en el `style` del root de la pagina. */
export function smartlinkThemeStyle(theme: SmartlinkTheme): Record<string, string> {
  return {
    "--sl-bg": theme.bg,
    "--sl-fg": theme.fg,
    "--sl-fg-muted": theme.fgMuted,
    "--sl-fg-faint": theme.fgFaint,
    "--sl-surface": theme.surface,
    "--sl-btn-bg": theme.btnBg,
    "--sl-btn-fg": theme.btnFg,
    "--sl-btn-fg-faint": theme.btnFgFaint,
    "--sl-accent": theme.accent,
    "--sl-accent-soft-bg": theme.accentSoftBg,
    "--sl-accent-soft-fg": theme.accentSoftFg,
  };
}
