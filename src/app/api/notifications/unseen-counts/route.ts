import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// Modulos soportados hoy. Agregar aca cuando se sume el punto rojo a otra
// pantalla -- cada uno necesita su propia cuenta de "nuevos desde ultima vista".
const MODULES = ["lead_candidates", "deals", "tasks"] as const;

export async function GET() {
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;

  const { data: views } = await supabase
    .from("user_module_views")
    .select("module_key, last_seen_at")
    .eq("user_id", user!.id);

  const lastSeenMap = new Map((views ?? []).map((v) => [v.module_key, v.last_seen_at]));

  const counts: Record<string, number> = {};

  for (const moduleKey of MODULES) {
    const lastSeenAt = lastSeenMap.get(moduleKey) ?? "1970-01-01T00:00:00Z";

    if (moduleKey === "lead_candidates") {
      const { count } = await supabase
        .from("lead_candidates")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId!)
        .eq("status", "pending_review")
        .gt("created_at", lastSeenAt);

      counts[moduleKey] = count ?? 0;
    }

    if (moduleKey === "deals") {
      const { count } = await supabase
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId!)
        .is("deleted_at", null)
        .gt("created_at", lastSeenAt)
        .or(`created_by.is.null,created_by.neq.${user!.id}`);

      counts[moduleKey] = count ?? 0;
    }

    if (moduleKey === "tasks") {
      const { count } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId!)
        .is("deleted_at", null)
        .gt("created_at", lastSeenAt)
        .or(`created_by.is.null,created_by.neq.${user!.id}`);

      counts[moduleKey] = count ?? 0;
    }
  }

  return NextResponse.json(counts);
}
