import { z } from "zod";

// Contratos de /api/public/testimonials/*. Todo se recorta (trim) y el
// correo se normaliza a minusculas antes de guardarlo.

const optionalText = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" ? v.trim().slice(0, max) || null : null));

export const startSchema = z.object({
  site: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2, "Nombre requerido").max(80),
  email: z
    .string()
    .trim()
    .max(200)
    .email("Correo invalido")
    .transform((v) => v.toLowerCase()),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().min(10, "Cuentanos un poco mas (minimo 10 caracteres)").max(1500),
  relation: optionalText(60),
  // Honeypot: campo invisible en el formulario. Si viene con contenido, es un bot.
  website: optionalText(200),
});
export type StartInput = z.infer<typeof startSchema>;

export const verifySchema = z.object({
  site: z.string().trim().min(1).max(40),
  id: z.string().uuid(),
  code: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "El codigo tiene 6 digitos")),
});
export type VerifyInput = z.infer<typeof verifySchema>;

export const moderateSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
});
export type ModerateInput = z.infer<typeof moderateSchema>;
