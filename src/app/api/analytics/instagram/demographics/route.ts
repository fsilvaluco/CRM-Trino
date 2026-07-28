import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ gender: [], age: [], country: [], city: [] });
  }

  const { data, error: dbError } = await supabase
    .from("instagram_demographics")
    .select("breakdown_type, breakdown_value, value")
    .eq("organization_id", orgId!)
    .eq("project_id", projectId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const grouped: Record<"gender" | "age" | "country" | "city", Array<{ label: string; value: number }>> = {
    gender: [],
    age: [],
    country: [],
    city: [],
  };

  for (const row of data ?? []) {
    const key = row.breakdown_type as keyof typeof grouped;
    if (grouped[key]) {
      grouped[key].push({ label: row.breakdown_value, value: row.value });
    }
  }

  // Ordenar cada grupo de mayor a menor para que las tablas/graficos se
  // vean consistentes sin que el frontend tenga que hacerlo.
  for (const key of Object.keys(grouped) as Array<keyof typeof grouped>) {
    grouped[key].sort((a, b) => b.value - a.value);
  }

  return NextResponse.json(grouped);
}
