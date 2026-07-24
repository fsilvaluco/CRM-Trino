export type ImportTargetType = "social_followers" | "contacts" | "companies" | "spotify_stats" | "shows";

export interface ImportField {
  key: string;
  label: string;
  type: "text" | "number" | "date";
  required: boolean;
}

export const IMPORT_TARGETS: Record<ImportTargetType, { label: string; description: string; fields: ImportField[] }> = {
  social_followers: {
    label: "Histórico de seguidores",
    description: "Instagram, TikTok, YouTube, Spotify o Facebook — un archivo por plataforma.",
    fields: [
      { key: "recordedAt", label: "Fecha", type: "date", required: true },
      { key: "followers", label: "Seguidores", type: "number", required: true },
    ],
  },
  contacts: {
    label: "Contactos",
    description: "Personas del CRM.",
    fields: [
      { key: "name", label: "Nombre", type: "text", required: true },
      { key: "email", label: "Email", type: "text", required: false },
      { key: "phone", label: "Teléfono", type: "text", required: false },
      { key: "company", label: "Empresa (texto)", type: "text", required: false },
      { key: "notes", label: "Notas", type: "text", required: false },
    ],
  },
  companies: {
    label: "Empresas",
    description: "Empresas del CRM.",
    fields: [
      { key: "name", label: "Nombre", type: "text", required: true },
      { key: "industry", label: "Rubro", type: "text", required: false },
      { key: "website", label: "Sitio web", type: "text", required: false },
      { key: "email", label: "Email", type: "text", required: false },
      { key: "phone", label: "Teléfono", type: "text", required: false },
      { key: "address", label: "Dirección", type: "text", required: false },
      { key: "notes", label: "Notas", type: "text", required: false },
    ],
  },
  spotify_stats: {
    label: "Estadísticas de Spotify",
    description: "Oyentes, reproducciones, guardados, etc. por período.",
    fields: [
      { key: "periodStart", label: "Desde", type: "date", required: true },
      { key: "periodEnd", label: "Hasta", type: "date", required: true },
      { key: "listeners", label: "Oyentes", type: "number", required: false },
      { key: "monthlyActiveListeners", label: "Oyentes activos mensuales", type: "number", required: false },
      { key: "streams", label: "Reproducciones", type: "number", required: false },
      { key: "streamsPerListener", label: "Reproducciones por oyente", type: "number", required: false },
      { key: "saves", label: "Veces que se guardó", type: "number", required: false },
      { key: "playlistAdds", label: "Veces agregado a playlist", type: "number", required: false },
      { key: "followers", label: "Seguidores", type: "number", required: false },
    ],
  },
  shows: {
    label: "Shows / conciertos",
    description: "Historial de shows.",
    fields: [
      { key: "date", label: "Fecha", type: "date", required: true },
      { key: "venue", label: "Lugar", type: "text", required: true },
      { key: "city", label: "Ciudad", type: "text", required: false },
      { key: "fee", label: "Fee (CLP)", type: "number", required: false },
      { key: "ticketIncome", label: "Ingreso por tickets (CLP)", type: "number", required: false },
      { key: "expenses", label: "Gastos (CLP)", type: "number", required: false },
      { key: "notes", label: "Notas", type: "text", required: false },
    ],
  },
};

/** true si el tipo requiere elegir una plataforma antes de mapear columnas. */
export function targetNeedsPlatform(type: ImportTargetType): boolean {
  return type === "social_followers";
}
