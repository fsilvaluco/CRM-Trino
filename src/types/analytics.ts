import { z } from "zod";

// ── Shows ────────────────────────────────────────────────────────────────────

export interface Show {
  id: string;
  organizationId: string;
  date: string;
  venue: string;
  city: string | null;
  /** Fee in CLP cents */
  fee: number;
  /** Ticket income in CLP cents */
  ticketIncome: number;
  /** Expenses in CLP cents */
  expenses: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Computed: fee + ticketIncome - expenses (null if all three are null) */
  utility: number | null;
  /** Average vibe from show_ratings (1–10), undefined when no ratings exist */
  avgVibe?: number;
}

export interface ShowRating {
  id: string;
  showId: string;
  musicianName: string;
  /** 1–10 */
  vibe: number | null;
  audienceSang: boolean | null;
  /** 1–5 */
  monitorQuality: number | null;
  notes: string | null;
  createdAt: string;
}

// ── Social Metrics ────────────────────────────────────────────────────────────

export type SocialPlatform = "instagram" | "tiktok" | "youtube" | "spotify" | "facebook";

export interface SocialMetric {
  id: string;
  organizationId: string;
  platform: SocialPlatform;
  followers: number;
  recordedAt: string;
  createdAt: string;
}

// ── Merch Snapshots ───────────────────────────────────────────────────────────

export interface MerchSnapshot {
  id: string;
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  /** Total sales in CLP cents */
  totalSales: number | null;
  unitsSold: number | null;
  createdAt: string;
}

// ── Shopify (Merch) ───────────────────────────────────────────────────────────
// Datos de solo lectura: se llenan desde el sync con Shopify, nunca desde un
// formulario en la UI.

export interface ShopifyProduct {
  id: string;
  shopifyProductId: number;
  title: string;
  status: string | null;
  available: boolean;
  inventoryQuantity: number;
  /** Precio de la variante más barata, en CLP cents */
  price: number | null;
  imageUrl: string | null;
  updatedAt: string;
}

export interface ShopifySalesMonth {
  id: string;
  /** Primer día del mes, YYYY-MM-01 */
  month: string;
  unitsSold: number;
  /** CLP cents */
  totalSales: number;
  ordersCount: number;
}

// ── Zod schemas & inferred input types ───────────────────────────────────────

export const createShowSchema = z.object({
  projectId: z.string().uuid("El proyecto es requerido"),
  date: z.string().min(1, "La fecha es requerida"),
  venue: z.string().trim().min(1, "El venue es requerido"),
  city: z.string().trim().optional().nullable(),
  fee: z.coerce.number().int().nonnegative().optional().nullable(),
  ticketIncome: z.coerce.number().int().nonnegative().optional().nullable(),
  expenses: z.coerce.number().int().nonnegative().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export type CreateShowInput = z.infer<typeof createShowSchema>;

export const createSocialMetricSchema = z.object({
  projectId: z.string().uuid("El proyecto es requerido"),
  platform: z.enum(["instagram", "tiktok", "youtube", "spotify", "facebook"], {
    error: "La plataforma debe ser instagram, tiktok o youtube",
  }),
  followers: z.coerce.number().int().positive("Los seguidores deben ser un entero positivo"),
  recordedAt: z.string().min(1, "La fecha es requerida"),
});

export type CreateSocialMetricInput = z.infer<typeof createSocialMetricSchema>;

export const createMerchSnapshotSchema = z.object({
  projectId: z.string().uuid("El proyecto es requerido"),
  periodStart: z.string().min(1, "La fecha de inicio es requerida"),
  periodEnd: z.string().min(1, "La fecha de fin es requerida"),
  totalSales: z.coerce.number().int().nonnegative().optional().nullable(),
  unitsSold: z.coerce.number().int().nonnegative().optional().nullable(),
});

export type CreateMerchSnapshotInput = z.infer<typeof createMerchSnapshotSchema>;
