import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { isUuid } from "@/lib/preescuchas";

// Solo servidor: lo usan las rutas /api/preescuchas/[id]/links/**.

/** Carga la preescucha y verifica que el usuario tenga acceso a su proyecto. */
export async function loadPreescuchaForLinks(id: string) {
  const auth = await requireAuth();
  if (auth.error) return { ...auth, preescucha: null };
  const notFound = NextResponse.json({ error: "Preescucha no encontrada" }, { status: 404 });
  if (!isUuid(id)) return { ...auth, preescucha: null, error: notFound };

  const { data: preescucha } = await auth.supabase
    .from("preescuchas")
    .select("id, project_id, organization_id, expires_at, purged_at")
    .eq("id", id)
    .maybeSingle();
  if (!preescucha) return { ...auth, preescucha: null, error: notFound };
  if (!auth.allowedProjectIds.includes(preescucha.project_id)) {
    return { ...auth, preescucha: null, error: NextResponse.json({ error: "Sin acceso a esta preescucha" }, { status: 403 }) };
  }
  return { ...auth, preescucha };
}
