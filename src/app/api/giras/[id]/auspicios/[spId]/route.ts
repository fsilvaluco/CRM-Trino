import { NextRequest, NextResponse } from "next/server";
import { requireTourAccess } from "@/lib/tours/access";
import { sponsorshipPayload, currentUserName } from "@/lib/tours/sponsorship-fields";
import { mapSponsorship } from "@/lib/tours/map";

type Ctx = { params: Promise<{ id: string; spId: string }> };

// PATCH /api/giras/[id]/auspicios/[spId] -- editar campos. Un cambio de
// estado queda en el historial (trigger tg_sponsorship_status_log); aquí
// solo le ponemos el nombre de quien lo hizo.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id, spId } = await params;
  const { access, error } = await requireTourAccess(id, "edit");
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { row, error: vError } = sponsorshipPayload(body);
  if (vError) return NextResponse.json({ error: vError }, { status: 400 });
  if (Object.keys(row).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });

  const startedAt = new Date().toISOString();
  const { data, error: dbError } = await access.supabase
    .from("tour_sponsorships")
    .update(row)
    .eq("id", spId)
    .eq("tour_id", id)
    .select("*")
    .single();
  if (dbError || !data) return NextResponse.json({ error: dbError?.message ?? "Auspicio no encontrado" }, { status: 404 });

  if ("status" in row) {
    const name = await currentUserName(access.supabase, access.userId);
    await access.supabase
      .from("tour_sponsorship_updates")
      .update({ author_name: name })
      .eq("sponsorship_id", spId)
      .is("author_name", null)
      .gte("created_at", startedAt);
  }
  return NextResponse.json(mapSponsorship(data, true));
}

// DELETE /api/giras/[id]/auspicios/[spId]
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id, spId } = await params;
  const { access, error } = await requireTourAccess(id, "edit");
  if (error) return error;

  const { error: dbError } = await access.supabase.from("tour_sponsorships").delete().eq("id", spId).eq("tour_id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
