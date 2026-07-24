import { z } from "zod";

export type PressMentionType = "radio" | "tv" | "digital" | "digital_rrss";
export type PressMentionSource = "earned" | "own" | "partner";

export interface PressMention {
  id: string;
  projectId: string;
  campaignId: string | null;
  campaignName: string | null;
  mentionDate: string | null;
  outlet: string;
  type: PressMentionType;
  source: PressMentionSource;
  title: string;
  referenceUrl: string | null;
  socialUrl: string | null;
  notes: string | null;
  createdAt: string;
}

export const PRESS_TYPE_LABELS: Record<PressMentionType, string> = {
  radio: "Radio",
  tv: "TV",
  digital: "Digital",
  digital_rrss: "Digital / RRSS",
};

export const PRESS_SOURCE_LABELS: Record<PressMentionSource, string> = {
  earned: "Ganada",
  own: "Propia",
  partner: "Partner",
};

export const createPressMentionSchema = z.object({
  projectId: z.string().uuid("El proyecto es requerido"),
  campaignId: z.string().uuid().optional().nullable(),
  mentionDate: z.string().optional().nullable(),
  outlet: z.string().min(1, "El medio es requerido"),
  type: z.enum(["radio", "tv", "digital", "digital_rrss"]),
  source: z.enum(["earned", "own", "partner"]).default("earned"),
  title: z.string().min(1, "La descripción es requerida"),
  referenceUrl: z.string().optional().nullable(),
  socialUrl: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type CreatePressMentionInput = z.infer<typeof createPressMentionSchema>;
