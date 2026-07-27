import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { error: dbError } = await supabase
    .from("email_alias_rules")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId!);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
