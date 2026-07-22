import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { THEME_COLOR_KEYS } from "@/lib/theme-palettes";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  // Admin puede cambiar el color de cualquier proyecto de la organización.
  // Un artista (member) solo puede cambiar el de un proyecto al que
  // pertenece — no le da acceso a proyectos ajenos, solo a elegir su color.
  const canEditThisProject = isAdmin || (allowedProjectIds !== null && allowedProjectIds.includes(id));
  if (!canEditThisProject) {
    return NextResponse.json({ error: "Sin permisos sobre este proyecto" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const themeColor = (body as { themeColor?: string })?.themeColor;
  if (!themeColor || !THEME_COLOR_KEYS.includes(themeColor as (typeof THEME_COLOR_KEYS)[number])) {
    return NextResponse.json(
      { error: `themeColor debe ser una de: ${THEME_COLOR_KEYS.join(", ")}` },
      { status: 400 }
    );
  }

  const { data, error: dbError } = await supabase
    .from("projects")
    .update({ theme_color: themeColor, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name, theme_color")
    .single();

  if (dbError || !data) {
    return NextResponse.json({ error: dbError?.message ?? "Proyecto no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ id: data.id, name: data.name, themeColor: data.theme_color });
}
