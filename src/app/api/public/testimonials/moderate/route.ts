import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { htmlPage } from "@/lib/testimonials/http";
import { moderateSchema, type ModerateInput } from "@/lib/testimonials/schema";
import { checkModerationLink, moderateTestimonial } from "@/lib/testimonials/service";

// /api/public/testimonials/moderate?id=..&action=approve|reject&token=..
// Links que reciben los admins por correo. El token es el secreto (en la
// base solo esta su sha256, comparado en tiempo constante).
//
// GET muestra una pagina de confirmacion y el cambio de estado se hace con
// el POST del boton: los escaneres de links de los clientes de correo
// (Outlook Safe Links, antivirus, previsualizaciones) abren los GET solos,
// y si el GET moderara, un correo recien llegado podria aprobarse o
// rechazarse sin que nadie lo tocara.

const LABEL = {
  approve: { verb: "Aprobar", done: "Testimonio aprobado", msg: "Ya se muestra en el sitio (puede tardar hasta un minuto por la cache)." },
  reject: { verb: "Rechazar", done: "Testimonio rechazado", msg: "No se publicara. Si fue un error, usa el link de aprobar del mismo correo." },
} as const;

function parse(request: NextRequest): ModerateInput | null {
  const q = request.nextUrl.searchParams;
  const parsed = moderateSchema.safeParse({ id: q.get("id"), action: q.get("action"), token: q.get("token") });
  return parsed.success ? parsed.data : null;
}

export async function GET(request: NextRequest) {
  const input = parse(request);
  if (!input) return htmlPage("Link no valido", "Revisa que el link este completo.", 400);

  try {
    const check = await checkModerationLink(createAdminClient(), input);
    if (!check.ok) return htmlPage("No se pudo moderar", check.error, check.status);

    const l = LABEL[input.action];
    const current =
      check.row.status === "approved" ? "Hoy esta <strong>aprobado</strong>." :
      check.row.status === "rejected" ? "Hoy esta <strong>rechazado</strong>." :
      "Hoy esta <strong>pendiente de revision</strong>.";
    // El form reenvia a la misma URL (con id, action y token en la query).
    const form = `<form method="post"><button type="submit" class="${input.action}">${l.verb} testimonio</button></form>`;
    return htmlPage(`${l.verb} testimonio`, `${current} Confirma para ${l.verb.toLowerCase()}lo.`, 200, form);
  } catch (err) {
    console.error("[testimonials/moderate:get]", err instanceof Error ? err.message : err);
    return htmlPage("Error", "No pudimos cargar el testimonio. Intenta de nuevo.", 500);
  }
}

export async function POST(request: NextRequest) {
  const input = parse(request);
  if (!input) return htmlPage("Link no valido", "Revisa que el link este completo.", 400);

  try {
    const result = await moderateTestimonial(createAdminClient(), input);
    if (!result.ok) return htmlPage("No se pudo moderar", result.error, result.status);
    const l = LABEL[input.action];
    return htmlPage(l.done, l.msg);
  } catch (err) {
    console.error("[testimonials/moderate:post]", err instanceof Error ? err.message : err);
    return htmlPage("Error", "No pudimos guardar la decision. Intenta de nuevo.", 500);
  }
}
