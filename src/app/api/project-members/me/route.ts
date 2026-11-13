import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions } from "@/lib/project-roles";

// GET /api/project-members/me?projectId=xxx -- matriz EFECTIVA del usuario
// autenticado en ese proyecto (la misma que usan los endpoints para validar
// ver/editar/eliminar, incluida la herencia desde el proyecto madre). La
// usa el cliente (project-context) para mostrar u ocultar acciones con la
// misma regla que aplica el server. No expone la matriz de otras personas.
export async function GET(request: NextRequest) {
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId requerido" }, { status: 400 });
  }
  if (!allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ permissions: null });
  }

  const permissions = await getProjectPermissions(supabase, user!.id, projectId);
  return NextResponse.json({ permissions });
}
