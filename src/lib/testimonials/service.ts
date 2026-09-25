import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/resend";
import {
  CODE_TTL_MINUTES,
  MAX_CODE_ATTEMPTS,
  MAX_STARTS_PER_EMAIL_PER_HOUR,
  MODERATION_TOKEN_TTL_DAYS,
  PUBLIC_LIST_LIMIT,
  TESTIMONIALS_APP_PATH,
  type TestimonialSiteConfig,
} from "./config";
import { generateCode, generateToken, hashCode, hashToken, safeEqualHex } from "./crypto";
import { buildTestimonialCodeEmailHtml, buildTestimonialModerationEmailHtml } from "./emails";
import type { ModerateInput, StartInput, VerifyInput } from "./schema";

// Logica del flujo de testimonios (tabla public.testimonials, migracion 108).
// Todo corre con service role: la tabla no tiene politicas RLS publicas.
// Ninguna funcion devuelve correo ni hashes hacia afuera.

type Db = ReturnType<typeof createAdminClient>;

export type ServiceFailure = { ok: false; status: number; error: string; extra?: Record<string, unknown> };
export type ServiceResult<T = object> = ({ ok: true } & T) | ServiceFailure;

function fail(status: number, error: string, extra?: Record<string, unknown>): ServiceFailure {
  return { ok: false, status, error, extra };
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

// ─── Aviso al equipo para moderar ────────────────────────────────────────────

interface ModerationEmailRow {
  id: string;
  name: string;
  email: string;
  rating: number;
  body: string;
  relation: string | null;
}

/**
 * Manda a cada admin del sitio el testimonio con los links aprobar/rechazar.
 * Un correo por admin: si uno falla, los demas igual llegan. La persona ya
 * cumplio su parte, asi que los fallos solo se registran en el log.
 */
async function notifyAdminsForModeration(
  site: TestimonialSiteConfig,
  row: ModerationEmailRow,
  token: string,
  logTag: string,
): Promise<void> {
  const link = (action: "approve" | "reject") =>
    `${appBaseUrl()}/api/public/testimonials/moderate?id=${row.id}&action=${action}&token=${token}`;
  const html = buildTestimonialModerationEmailHtml({
    brandName: site.brandName,
    name: row.name,
    email: row.email,
    rating: row.rating,
    body: row.body,
    relation: row.relation,
    approveUrl: link("approve"),
    rejectUrl: link("reject"),
    expiresDays: MODERATION_TOKEN_TTL_DAYS,
    appUrl: `${appBaseUrl()}${TESTIMONIALS_APP_PATH}`,
  });
  const results = await Promise.allSettled(
    site.adminEmails.map((to) =>
      sendEmail({ to, subject: `Nuevo testimonio de ${row.name} (${row.rating}/5) para aprobar`, html }),
    ),
  );
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`[${logTag}] correo al admin`, site.adminEmails[i], r.reason instanceof Error ? r.reason.message : r.reason);
    }
  });
}

// ─── POST /start ─────────────────────────────────────────────────────────────

export async function startTestimonial(
  db: Db,
  site: TestimonialSiteConfig,
  input: StartInput,
  meta: { ip: string | null; userAgent: string | null },
): Promise<ServiceResult<{ id: string; verified: boolean }>> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await db
    .from("testimonials")
    .select("id", { count: "exact", head: true })
    .eq("email", input.email)
    .gte("created_at", since);
  if (countError) throw new Error(`count: ${countError.message}`);
  if ((count ?? 0) >= MAX_STARTS_PER_EMAIL_PER_HOUR) {
    return fail(
      429,
      site.requireEmailCode
        ? "Ya pediste varios codigos para este correo. Intenta de nuevo en una hora."
        : "Ya recibimos varios testimonios de este correo. Intenta de nuevo en una hora.",
    );
  }

  // Sitio sin codigo: el testimonio queda verificado directo y se avisa al
  // equipo para aprobar/rechazar. Nada se publica sin moderacion.
  if (!site.requireEmailCode) {
    const id = randomUUID();
    const token = generateToken();
    const { error: insertError } = await db.from("testimonials").insert({
      id,
      project_id: site.projectId,
      name: input.name,
      email: input.email,
      rating: input.rating,
      body: input.body,
      relation: input.relation,
      status: "verified",
      verified_at: new Date().toISOString(),
      code_hash: null,
      code_expires_at: null,
      code_attempts: 0,
      approve_token_hash: hashToken(token),
      ip: meta.ip,
      user_agent: meta.userAgent?.slice(0, 500) ?? null,
    });
    if (insertError) throw new Error(`insert: ${insertError.message}`);

    await notifyAdminsForModeration(
      site,
      { id, name: input.name, email: input.email, rating: input.rating, body: input.body, relation: input.relation ?? null },
      token,
      "testimonials/start",
    );
    return { ok: true, id, verified: true };
  }

  // El id se genera aqui para poder amarrar el hash del codigo a la fila en un solo insert.
  const id = randomUUID();
  const code = generateCode();
  const { error: insertError } = await db.from("testimonials").insert({
    id,
    project_id: site.projectId,
    name: input.name,
    email: input.email,
    rating: input.rating,
    body: input.body,
    relation: input.relation,
    status: "pending_code",
    code_hash: hashCode(code, id),
    code_expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString(),
    code_attempts: 0,
    ip: meta.ip,
    user_agent: meta.userAgent?.slice(0, 500) ?? null,
  });
  if (insertError) throw new Error(`insert: ${insertError.message}`);

  try {
    await sendEmail({
      to: input.email,
      subject: `Tu código para publicar tu testimonio en ${site.brandName}: ${code}`,
      html: buildTestimonialCodeEmailHtml({ brandName: site.brandName, name: input.name, code, minutes: CODE_TTL_MINUTES }),
    });
  } catch (err) {
    console.error("[testimonials/start] correo del codigo", err instanceof Error ? err.message : err);
    return fail(502, "No pudimos enviarte el codigo. Revisa tu correo e intenta de nuevo.");
  }

  return { ok: true, id, verified: false };
}

// ─── POST /verify ────────────────────────────────────────────────────────────

interface PendingRow {
  id: string;
  name: string;
  email: string;
  rating: number;
  body: string;
  relation: string | null;
  status: string;
  code_hash: string | null;
  code_expires_at: string | null;
  code_attempts: number;
}

export async function verifyTestimonial(
  db: Db,
  site: TestimonialSiteConfig,
  input: VerifyInput,
): Promise<ServiceResult> {
  const { data, error } = await db
    .from("testimonials")
    .select("id, name, email, rating, body, relation, status, code_hash, code_expires_at, code_attempts")
    .eq("id", input.id)
    .eq("project_id", site.projectId)
    .maybeSingle();
  if (error) throw new Error(`select: ${error.message}`);
  const row = data as PendingRow | null;
  if (!row) return fail(404, "No encontramos tu testimonio. Vuelve a enviarlo.");

  // Doble envio del mismo formulario: ya quedo verificado, no se repite nada.
  if (row.status !== "pending_code") return { ok: true };

  if (!row.code_expires_at || new Date(row.code_expires_at).getTime() < Date.now()) {
    return fail(410, "El codigo vencio. Vuelve a enviar tu testimonio para recibir uno nuevo.");
  }
  if (row.code_attempts >= MAX_CODE_ATTEMPTS) {
    return fail(429, "Superaste los intentos permitidos. Vuelve a enviar tu testimonio para recibir un codigo nuevo.");
  }

  // El intento se cuenta ANTES de comparar y con control optimista
  // (code_attempts = valor leido): dos requests en paralelo no pueden
  // gastar el mismo intento.
  const { data: bumped, error: bumpError } = await db
    .from("testimonials")
    .update({ code_attempts: row.code_attempts + 1 })
    .eq("id", row.id)
    .eq("status", "pending_code")
    .eq("code_attempts", row.code_attempts)
    .select("id");
  if (bumpError) throw new Error(`attempts: ${bumpError.message}`);
  if (!bumped?.length) return fail(409, "Intenta de nuevo.");

  if (!safeEqualHex(hashCode(input.code, row.id), row.code_hash)) {
    const remaining = MAX_CODE_ATTEMPTS - (row.code_attempts + 1);
    return fail(400, remaining > 0 ? "Codigo incorrecto." : "Codigo incorrecto. Ya no quedan intentos.", {
      attemptsLeft: Math.max(0, remaining),
    });
  }

  const token = generateToken();
  const { data: updated, error: updError } = await db
    .from("testimonials")
    .update({
      status: "verified",
      verified_at: new Date().toISOString(),
      code_hash: null,
      code_expires_at: null,
      approve_token_hash: hashToken(token),
    })
    .eq("id", row.id)
    .eq("status", "pending_code")
    .select("id");
  if (updError) throw new Error(`verify: ${updError.message}`);
  if (!updated?.length) return { ok: true }; // Otra request lo verifico primero.

  await notifyAdminsForModeration(site, row, token, "testimonials/verify");

  return { ok: true };
}

// ─── GET/POST /moderate ──────────────────────────────────────────────────────

interface ModerationRow {
  id: string;
  name: string;
  status: string;
  approve_token_hash: string | null;
  verified_at: string | null;
}

/** Valida id + token. Devuelve la fila si el link sirve para moderar. */
export async function checkModerationLink(db: Db, input: ModerateInput): Promise<ServiceResult<{ row: ModerationRow }>> {
  const { data, error } = await db
    .from("testimonials")
    .select("id, name, status, approve_token_hash, verified_at")
    .eq("id", input.id)
    .maybeSingle();
  if (error) throw new Error(`select: ${error.message}`);
  const row = data as ModerationRow | null;

  // Mismo mensaje para "no existe" y "token malo": no se filtra que ids existen.
  if (!row || !safeEqualHex(hashToken(input.token), row.approve_token_hash)) {
    return fail(403, "El link no es valido.");
  }
  if (!["verified", "approved", "rejected"].includes(row.status)) return fail(409, "El testimonio aun no esta verificado.");
  const verifiedAt = row.verified_at ? new Date(row.verified_at).getTime() : 0;
  if (Date.now() - verifiedAt > MODERATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000) {
    return fail(410, "El link vencio. Modera el testimonio directamente en la base.");
  }
  return { ok: true, row };
}

export async function moderateTestimonial(db: Db, input: ModerateInput): Promise<ServiceResult<{ status: string }>> {
  const check = await checkModerationLink(db, input);
  if (!check.ok) return check;

  const status = input.action === "approve" ? "approved" : "rejected";
  const { error } = await db
    .from("testimonials")
    .update({ status, approved_at: status === "approved" ? new Date().toISOString() : null })
    .eq("id", check.row.id)
    .in("status", ["verified", "approved", "rejected"]);
  if (error) throw new Error(`moderate: ${error.message}`);
  return { ok: true, status };
}

// ─── GET / (listado publico) ─────────────────────────────────────────────────

export interface PublicTestimonial {
  name: string;
  rating: number;
  body: string;
  relation: string | null;
  approved_at: string;
}

export async function listApprovedTestimonials(db: Db, site: TestimonialSiteConfig): Promise<PublicTestimonial[]> {
  const { data, error } = await db
    .from("testimonials")
    .select("name, rating, body, relation, approved_at")
    .eq("project_id", site.projectId)
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .limit(PUBLIC_LIST_LIMIT);
  if (error) throw new Error(`list: ${error.message}`);
  return (data ?? []) as PublicTestimonial[];
}
