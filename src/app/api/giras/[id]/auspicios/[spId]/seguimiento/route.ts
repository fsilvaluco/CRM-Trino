import { NextRequest, NextResponse } from "next/server";
import { requireTourAccess } from "@/lib/tours/access";
import { currentUserName, SPONSORSHIP_STATUSES } from "@/lib/tours/sponsorship-fields";
import { mapSponsorshipUpdate, mapSponsorship } from "@/lib/tours/map";
import type { SponsorshipStatus } from "@/types/tours";

type Ctx = { params: Promise<{ id: string; spId: string }> };

async function belongs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tourId: string,
  spId: string
) {
  const { data } = await supabase.from("tour_sponsorships").select("id, status").eq("id", spId).eq("tour_id", tourId).maybeSingle();
  return data as { id: string; status: SponsorshipStatus } | null;
}

// GET -- historial de seguimiento de un auspicio (más nuevo primero).
export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id, spId } = await params;
  const { access, error } = await requireTourAccess(id, "view");
  if (error) return error;
  if (!(await belongs(access.supabase, id, spId))) return NextResponse.json({ error: "Auspicio no encontrado" }, { status: 404 });

  const { data, error: dbError } = await access.supabase
    .from("tour_sponsorship_updates")
    .select("*")
    .eq("sponsorship_id", spId)
    .order("created_at", { ascending: false });
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(mapSponsorshipUpdate));
}

// POST -- registrar seguimiento: nota, opcionalmente nuevo estado, si hubo
// contacto con la marca (mueve last_contact_at, que usan las alertas) y la
// fecha del próximo seguimiento.
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id, spId } = await params;
  const { access, error } = await requireTourAccess(id, "edit");
  if (error) return error;
  const current = await belongs(access.supabase, id, spId);
  if (!current) return NextResponse.json({ error: "Auspicio no encontrado" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const note: string = (body.note ?? "").trim();
  const newStatus: SponsorshipStatus | null =
    body.status && body.status !== current.status && SPONSORSHIP_STATUSES.includes(body.status) ? body.status : null;
  if (!note && !newStatus) return NextResponse.json({ error: "Escribe una nota o cambia el estado" }, { status: 400 });

  const authorName = await currentUserName(access.supabase, access.userId);
  const update: Record<string, unknown> = {};
  if (newStatus) update.status = newStatus;
  if (body.contacted) update.last_contact_at = new Date().toISOString();
  if ("nextFollowupAt" in body) update.next_followup_at = body.nextFollowupAt || null;

  const startedAt = new Date().toISOString();
  if (Object.keys(update).length > 0) {
    const { error: upError } = await access.supabase.from("tour_sponsorships").update(update).eq("id", spId);
    if (upError) return NextResponse.json({ error: upError.message }, { status: 500 });
  }

  if (newStatus) {
    // El trigger ya dejó la fila del cambio de estado: le sumamos la nota y el autor.
    await access.supabase
      .from("tour_sponsorship_updates")
      .update({ note: note || null, author_name: authorName })
      .eq("sponsorship_id", spId)
      .eq("status_to", newStatus)
      .gte("created_at", startedAt);
  } else {
    const { error: insError } = await access.supabase
      .from("tour_sponsorship_updates")
      .insert({ sponsorship_id: spId, author_id: access.userId, author_name: authorName, note });
    if (insError) return NextResponse.json({ error: insError.message }, { status: 500 });
  }

  const { data } = await access.supabase.from("tour_sponsorships").select("*").eq("id", spId).single();
  return NextResponse.json(mapSponsorship(data, true), { status: 201 });
}
