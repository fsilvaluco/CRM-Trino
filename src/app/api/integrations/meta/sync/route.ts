import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { syncInstagram } from "@/lib/meta-sync";

export async function POST() {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { data: integration, error: dbError } = await supabase
    .from("artist_integrations")
    .select("*")
    .eq("organization_id", orgId!)
    .eq("platform", "instagram")
    .single();

  if (dbError || !integration) {
    return NextResponse.json(
      { error: "Sin integración de Instagram conectada" },
      { status: 404 }
    );
  }

  try {
    const result = await syncInstagram(supabase, orgId!, integration.access_token);
    return NextResponse.json({ ok: true, followers: result.followers, recordedAt: result.recordedAt });
  } catch (syncError: unknown) {
    const message = syncError instanceof Error ? syncError.message : "Error de sincronización";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
