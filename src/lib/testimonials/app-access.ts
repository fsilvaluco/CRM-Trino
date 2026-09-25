import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions } from "@/lib/project-roles";
import { getTestimonialSiteConfigForProject, type TestimonialSiteConfig } from "./config";

// Acceso a la seccion Testimonios de la app (/testimonios y
// /api/testimonials/*). El projectId que manda el cliente nunca se usa sin
// verificar primero que la persona es miembro de ese proyecto (fila propia
// o heredada del proyecto madre, igual que el resto de la app).
//
// - Ver el listado: cualquier miembro del proyecto (sin el correo de quien
//   escribio el testimonio).
// - Moderar (aprobar/rechazar) y ver correos: admin del proyecto, es decir
//   plantilla `admin` en project_members o `puede_gestionar_equipo` (ROLES.md 0.2.1).
//
// La tabla testimonials no tiene politicas RLS para usuarios: las lecturas
// y escrituras se hacen con el cliente admin DESPUES de este chequeo, y
// siempre filtradas por project_id.

export type TestimonialsAccess =
  | { ok: true; userId: string; projectId: string; site: TestimonialSiteConfig; canModerate: boolean }
  | { ok: false; response: NextResponse };

export async function getTestimonialsAccess(projectId: string | null | undefined): Promise<TestimonialsAccess> {
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error || !user) return { ok: false, response: error ?? NextResponse.json({ error: "No autenticado" }, { status: 401 }) };

  if (!projectId || !allowedProjectIds?.includes(projectId)) {
    return { ok: false, response: NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 }) };
  }

  const site = getTestimonialSiteConfigForProject(projectId);
  if (!site) {
    return { ok: false, response: NextResponse.json({ error: "Este proyecto no tiene testimonios configurados" }, { status: 404 }) };
  }

  const perm = await getProjectPermissions(supabase, user.id, projectId);
  if (!perm) {
    return { ok: false, response: NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 }) };
  }
  const canModerate = perm.role === "admin" || perm.puedeGestionarEquipo;

  return { ok: true, userId: user.id, projectId, site, canModerate };
}
