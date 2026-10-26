import type { SponsorshipCategory, SponsorshipStatus } from "@/types/tours";

export const SPONSORSHIP_STATUSES: SponsorshipStatus[] = [
  "identificada",
  "dossier_en_preparacion",
  "dossier_listo",
  "enviada",
  "en_conversacion",
  "confirmada",
  "contraprestacion_entregada",
  "rechazada",
  "sin_respuesta",
];

export const SPONSORSHIP_CATEGORIES: SponsorshipCategory[] = ["alojamiento", "comida", "transporte", "afines", "medios", "otro"];

// camelCase del front -> columna de tour_sponsorships
const FIELDS: Record<string, string> = {
  brand: "brand",
  category: "category",
  request: "request",
  counterpart: "counterpart",
  city: "city",
  showId: "show_id",
  contactName: "contact_name",
  contactEmail: "contact_email",
  contactPhone: "contact_phone",
  website: "website",
  instagramUrl: "instagram_url",
  igFollowers: "ig_followers",
  responsibleName: "responsible_name",
  status: "status",
  estimatedValue: "estimated_value",
  confirmedValue: "confirmed_value",
  budgetLineId: "budget_line_id",
  dossierUrl: "dossier_url",
  dossierDone: "dossier_done",
  nextFollowupAt: "next_followup_at",
  notes: "notes",
};

/** Devuelve las columnas a escribir, o un error de validación. */
export function sponsorshipPayload(body: Record<string, unknown>): { row: Record<string, unknown>; error: string | null } {
  const row: Record<string, unknown> = {};
  for (const [k, col] of Object.entries(FIELDS)) {
    if (!(k in body)) continue;
    const v = body[k];
    row[col] = typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v;
  }
  if ("brand" in row && !row.brand) return { row, error: "La marca es obligatoria" };
  if (row.status && !SPONSORSHIP_STATUSES.includes(row.status as SponsorshipStatus)) return { row, error: "Estado inválido" };
  if (row.category && !SPONSORSHIP_CATEGORIES.includes(row.category as SponsorshipCategory)) return { row, error: "Categoría inválida" };
  for (const money of ["estimated_value", "confirmed_value", "ig_followers"]) {
    if (money in row && row[money] !== null) {
      const n = Number(row[money]);
      if (!Number.isFinite(n) || n < 0) return { row, error: "Monto inválido" };
      row[money] = Math.round(n);
    }
  }
  return { row, error: null };
}

/** Nombre a mostrar del usuario logueado (mismo criterio que comentarios de tratos). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function currentUserName(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
  return data?.full_name || data?.email || "Usuario";
}
