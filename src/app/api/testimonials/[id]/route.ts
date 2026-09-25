import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase-admin";
import { getTestimonialsAccess } from "@/lib/testimonials/app-access";

// PATCH /api/testimonials/[id] { projectId, action: "approve" | "reject" }
// Aprueba o rechaza un testimonio desde Artist Pro. Solo admins del
// proyecto (app-access.ts). Mismo efecto que los links del correo: se puede
// pasar de aprobado a rechazado y viceversa, pero nunca se modera uno que
// sigue esperando el codigo de verificacion (pending_code).

const bodySchema = z.object({
  projectId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Testimonio no valido" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const access = await getTestimonialsAccess(parsed.data.projectId);
  if (!access.ok) return access.response;
  if (!access.canModerate) {
    return NextResponse.json({ error: "Solo los admins del proyecto pueden moderar testimonios" }, { status: 403 });
  }

  const status = parsed.data.action === "approve" ? "approved" : "rejected";
  const { data, error } = await createAdminClient()
    .from("testimonials")
    .update({ status, approved_at: status === "approved" ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("project_id", access.projectId)
    .in("status", ["verified", "approved", "rejected"])
    .select("id, status, approved_at");

  if (error) {
    console.error("[api/testimonials] moderate", error.message);
    return NextResponse.json({ error: "No se pudo actualizar el testimonio" }, { status: 500 });
  }
  const row = data?.[0];
  if (!row) {
    return NextResponse.json({ error: "Testimonio no encontrado o sin confirmar" }, { status: 404 });
  }

  return NextResponse.json({ id: row.id, status: row.status, approvedAt: row.approved_at });
}
