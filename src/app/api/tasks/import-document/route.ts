import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { extractMilestonesFromDocument, fetchGoogleDocText, isOpenAIEnabled } from "@/lib/openai";

export async function POST(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  if (!isOpenAIEnabled()) {
    return NextResponse.json({ error: "OPENAI_API_KEY no está configurado en el servidor" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const { documentText: rawText, documentUrl, projectId } = body as {
    documentText?: string;
    documentUrl?: string;
    projectId?: string;
  };

  let documentText = rawText ?? "";

  if (documentUrl && documentUrl.trim()) {
    try {
      documentText = await fetchGoogleDocText(documentUrl.trim());
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo leer el documento desde el link";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  if (!documentText || documentText.trim().length < 20) {
    return NextResponse.json(
      { error: "Pega el texto o el link del documento (muy corto, vacío, o no se pudo leer)" },
      { status: 400 }
    );
  }

  let campaignNames: string[] = [];
  let memberNames: string[] = [];
  if (projectId) {
    const { data: campaigns } = await supabase
      .from("subprojects")
      .select("name")
      .eq("organization_id", orgId!)
      .eq("project_id", projectId);
    campaignNames = (campaigns ?? []).map((c) => c.name);

    const { data: members } = await supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", projectId)
      .eq("organization_id", orgId!);
    const memberUserIds = [...new Set((members ?? []).map((m) => m.user_id))];
    if (memberUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("full_name, email")
        .in("id", memberUserIds);
      memberNames = (profiles ?? [])
        .map((p) => p.full_name || p.email || null)
        .filter((n): n is string => Boolean(n));
    }
  }

  try {
    const milestones = await extractMilestonesFromDocument(
      documentText,
      campaignNames,
      new Date().getFullYear(),
      memberNames
    );
    return NextResponse.json({ milestones, campaignNames });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido al leer el documento";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
