import { NextRequest, NextResponse } from "next/server";
import { requireTourAccess } from "@/lib/tours/access";
import { sponsorshipPayload } from "@/lib/tours/sponsorship-fields";
import { mapSponsorship } from "@/lib/tours/map";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/giras/[id]/auspicios -- nueva marca/canje.
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { access, error } = await requireTourAccess(id, "edit");
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { row, error: vError } = sponsorshipPayload(body);
  if (vError || !row.brand) return NextResponse.json({ error: vError ?? "La marca es obligatoria" }, { status: 400 });

  const { data, error: dbError } = await access.supabase
    .from("tour_sponsorships")
    .insert({ ...row, tour_id: id, created_by: access.userId })
    .select("*")
    .single();
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json(mapSponsorship(data, true), { status: 201 });
}
