import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { extractMilestonesFromDocument, isOpenAIEnabled } from "@/lib/openai";

export async function POST(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  if (!isOpenAIEnabled()) {
    return NextResponse.json({ error: "OPENAI_API_KEY no está configurado en el servidor" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const { documentText, projectId } = body as { documentText?: string; projectId?: string };

  if (!documentText || documentText.trim().length < 20) {
    return NextResponse.json({ error: "Pega el texto del documento (muy corto o vacío)" }, { status: 400 });
  }

  let campaignNames: string[] = [];
  if (projectId) {
    const { data: campaigns } = await supabase
      .from("subprojects")
      .select("name")
      .eq("organization_id", orgId!)
      .eq("project_id", projectId);
    campaignNames = (campaigns ?? []).map((c) => c.name);
  }

  try {
    const milestones = await extractMilestonesFromDocument(
      documentText,
      campaignNames,
      new Date().getFullYear()
    );
    return NextResponse.json({ milestones, campaignNames });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido al leer el documento";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
