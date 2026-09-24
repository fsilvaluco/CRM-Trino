import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { canManageTeam, getProjectPermissions } from "@/lib/project-roles";
import { metaLeadAdsFormForProject } from "@/lib/leads/forms";
import {
  META_LEADGEN_PLATFORM,
  generateVerifyToken,
  metaLeadgenCallbackUrl,
  subscribePageToLeadgen,
} from "@/lib/leads/meta-leadgen";

// Credenciales de Meta Lead Ads por proyecto (artist_integrations,
// platform='meta_leadgen'): pagina, token de la pagina, App Secret y el
// verify token del webhook. Los secretos se escriben pero NUNCA se
// devuelven: la pantalla solo ve si existen. El verify token si se muestra
// (hay que pegarlo en la app de Meta) y se genera solo si no hay uno.
// Solo aplica a proyectos con un formulario `metaLeadAds` en src/lib/leads/forms.ts.

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
      return {
        error: NextResponse.json(
          { error: "Solo el owner/admin o un admin del proyecto puede cambiar Meta Lead Ads" },
          { status: 403 }
        ),
      };
    }
  }
  return { projectId: parsed.data, orgId: orgId! };
}

async function loadRow(projectId: string) {
  const { data } = await createAdminClient()
    .from("artist_integrations")
    .select("id, account_id, account_name, access_token, config, last_sync_at, updated_at")
    .eq("project_id", projectId)
    .eq("platform", META_LEADGEN_PLATFORM)
    .maybeSingle();
  return data;
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request.nextUrl.searchParams.get("projectId"), false);
  if ("error" in auth) return auth.error;
  const target = metaLeadAdsFormForProject(auth.projectId);
  const data = await loadRow(auth.projectId);
  const config = (data?.config ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    supported: Boolean(target),
    productName: target?.form.productName ?? null,
    pageId: data?.account_id ?? null,
    pageName: data?.account_name ?? null,
    hasPageToken: Boolean(data?.access_token),
    hasAppSecret: typeof config.app_secret === "string" && config.app_secret.length > 0,
    verifyToken: typeof config.verify_token === "string" ? config.verify_token : null,
    callbackUrl: metaLeadgenCallbackUrl(),
    lastLeadAt: data?.last_sync_at ?? null,
    updatedAt: data?.updated_at ?? null,
  });
}

const saveSchema = z.object({
  projectId: z.string().uuid(),
  pageId: z.string().trim().regex(/^\d{5,25}$/, "El ID de la página son solo números"),
  pageName: z.string().trim().max(80).optional(),
  // Vacio = mantener el valor actual.
  pageAccessToken: z.string().trim().max(1000).optional(),
  appSecret: z.string().trim().max(200).optional(),
  verifyToken: z
    .string()
    .trim()
    .max(200)
    .regex(/^[A-Za-z0-9._~-]*$/, "El verify token solo puede tener letras, números y . _ ~ -")
    .optional(),
});

// Suscribe la pagina guardada a la app (POST /{page-id}/subscribed_apps, campo leadgen)
// usando el token guardado en el servidor. Asi nadie tiene que usar el Graph API Explorer.
async function subscribe(projectId: unknown) {
  const auth = await authorize(typeof projectId === "string" ? projectId : null, true);
  if ("error" in auth) return auth.error;
  const row = await loadRow(auth.projectId);
  if (!row?.account_id || !row.access_token) {
    return NextResponse.json({ error: "Primero guarda el ID de la página y el token" }, { status: 400 });
  }
  try {
    const apps = await subscribePageToLeadgen(row.account_id, row.access_token);
    return NextResponse.json({ ok: true, apps });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    console.error("[integrations/meta-leadgen] subscribe:", message);
    return NextResponse.json({ error: `Meta no aceptó la suscripción: ${message}` }, { status: 502 });
  }
}

async function save(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (body && typeof body === "object" && (body as { action?: unknown }).action === "subscribe") {
    return subscribe((body as { projectId?: unknown }).projectId);
  }
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos invalidos" }, { status: 400 });
  }
  const auth = await authorize(parsed.data.projectId, true);
  if ("error" in auth) return auth.error;
  if (!metaLeadAdsFormForProject(auth.projectId)) {
    return NextResponse.json({ error: "Este proyecto no tiene un formulario para Meta Lead Ads" }, { status: 400 });
  }

  const db = createAdminClient();
  const existing = await loadRow(auth.projectId);
  const prevConfig = (existing?.config ?? {}) as Record<string, unknown>;
  const config: Record<string, unknown> = { ...prevConfig };
  if (parsed.data.appSecret) config.app_secret = parsed.data.appSecret;
  if (parsed.data.verifyToken) config.verify_token = parsed.data.verifyToken;
  if (typeof config.verify_token !== "string" || !config.verify_token) config.verify_token = generateVerifyToken();

  const fields: Record<string, unknown> = {
    account_id: parsed.data.pageId,
    account_name: parsed.data.pageName || null,
    config,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.pageAccessToken) fields.access_token = parsed.data.pageAccessToken;

  let error;
  if (existing) {
    ({ error } = await db.from("artist_integrations").update(fields).eq("id", existing.id));
  } else {
    const { data: project } = await db.from("projects").select("name").eq("id", auth.projectId).single();
    ({ error } = await db.from("artist_integrations").insert({
      ...fields,
      organization_id: auth.orgId,
      project_id: auth.projectId,
      artist_name: project?.name ?? "Proyecto",
      platform: META_LEADGEN_PLATFORM,
    }));
  }
  if (error) {
    console.error("[integrations/meta-leadgen]", error.message);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export const PUT = save;
export const POST = save;

export async function DELETE(request: NextRequest) {
  const auth = await authorize(request.nextUrl.searchParams.get("projectId"), true);
  if ("error" in auth) return auth.error;
  await createAdminClient()
    .from("artist_integrations")
    .delete()
    .eq("project_id", auth.projectId)
    .eq("platform", META_LEADGEN_PLATFORM);
  return NextResponse.json({ ok: true });
}
