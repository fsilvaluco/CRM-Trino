import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// POST /api/push/subscribe -- guarda la suscripcion que devuelve
// PushManager.subscribe() en el navegador. Idempotente: si el mismo
// endpoint ya existe (mismo navegador re-suscribiendose) actualiza las
// claves en vez de duplicar.
export async function POST(request: NextRequest) {
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint : null;
  const keys = body.keys as Record<string, unknown> | undefined;
  const p256dh = typeof keys?.p256dh === "string" ? keys.p256dh : null;
  const auth = typeof keys?.auth === "string" ? keys.auth : null;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Suscripcion invalida" }, { status: 400 });
  }

  const { error: dbError } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user!.id,
        organization_id: orgId,
        endpoint,
        p256dh,
        auth,
        user_agent: request.headers.get("user-agent") || null,
      },
      { onConflict: "endpoint" }
    );

  if (dbError) {
    return NextResponse.json({ error: `Error al guardar suscripcion: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE /api/push/subscribe -- se llama al desactivar el toggle. Solo
// borra suscripciones del propio usuario (RLS ademas lo garantiza).
export async function DELETE(request: NextRequest) {
  const { supabase, user, error } = await requireAuth();
  if (error) return error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint : null;
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint es requerido" }, { status: 400 });
  }

  const { error: dbError } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user!.id)
    .eq("endpoint", endpoint);

  if (dbError) {
    return NextResponse.json({ error: `Error al eliminar suscripcion: ${dbError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
