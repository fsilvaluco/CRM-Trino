import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { canManageTeam, getProjectPermissions } from "@/lib/project-roles";

// Pixel + token de la API de conversiones de Meta por proyecto
// (artist_integrations, platform='meta_capi'). Lo usan /q/[slug] y
// /api/leads/ingest. El token se escribe pero NUNCA se devuelve: la
// pantalla solo ve si existe y sus ultimos 4 caracteres.

const projectIdSchema = z.string().uuid();

async function authorize(projectId: string | null, write: boolean) {
  const { supabase, user, orgId, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return { error };
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return { error: NextResponse.json({ error: "Proyecto invalido" }, { status: 400 }) };
  if (!allowedProjectIds?.includes(parsed.data)) {
    return { error: NextResponse.json({ error: "Sin acceso al proyecto" }, { status: 403 }) };
  }
  // Pueden escribir: owner/admin de la organizacion, o quien gestiona el equipo del proyecto.
  if (write && !isAdmin) {
    const perm = await getProjectPermissions(supabase, user!.id, parsed.data);
    if (!canManageTeam(perm)) {
      return { error: NextResponse.json({ error: "Solo el owner/admin o un admin del proyecto puede cambiar el pixel" }, { status: 403 }) };
    }
  }
  return { projectId: parsed.data, orgId: orgId! };
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request.nextUrl.searchParams.get("projectId"), false);
  if ("error" in auth) return auth.error;
  const { data } = await createAdminClient()
    .from("artist_integrations")
    .select("account_id, account_name, access_token, updated_at")
    .eq("project_id", auth.projectId)
    .eq("platform", "meta_capi")
    .maybeSingle();
  return NextResponse.json({
    pixelId: data?.account_id ?? null,
    pixelName: data?.account_name ?? null,
    hasToken: Boolean(data?.access_token),
    tokenLast4: data?.access_token ? data.access_token.slice(-4) : null,
    updatedAt: data?.updated_at ?? null,
  });
}

const putSchema = z.object({
  projectId: z.string().uuid(),
  pixelId: z.string().trim().regex(/^\d{8,20}$/, "El ID del pixel son solo numeros"),
  pixelName: z.string().trim().max(80).optional(),
  // Vacio = mantener el token actual (permite cambiar solo el pixel).
  accessToken: z.string().trim().max(1000).optional(),
});

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos invalidos" }, { status: 400 });
  }
  const auth = await authorize(parsed.data.projectId, true);
  if ("error" in auth) return auth.error;

  const db = createAdminClient();
  const { data: project } = await db.from("projects").select("name").eq("id", auth.projectId).single();
  const { data: existing } = await db
    .from("artist_integrations")
    .select("id")
    .eq("project_id", auth.projectId)
    .eq("platform", "meta_capi")
    .maybeSingle();

  const fields: Record<string, unknown> = {
    account_id: parsed.data.pixelId,
    account_name: parsed.data.pixelName || null,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.accessToken) fields.access_token = parsed.data.accessToken;

  const { error } = existing
    ? await db.from("artist_integrations").update(fields).eq("id", existing.id)
    : await db.from("artist_integrations").insert({
        ...fields,
        organization_id: auth.orgId,
        project_id: auth.projectId,
        artist_name: project?.name ?? "Proyecto",
        platform: "meta_capi",
      });
  if (error) return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize(request.nextUrl.searchParams.get("projectId"), true);
  if ("error" in auth) return auth.error;
  await createAdminClient()
    .from("artist_integrations")
    .delete()
    .eq("project_id", auth.projectId)
    .eq("platform", "meta_capi");
  return NextResponse.json({ ok: true });
}
