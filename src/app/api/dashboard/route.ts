import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;
  if (!orgId) {
    return NextResponse.json({ error: "No organization found" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const isAllProjects = searchParams.get("isAllProjects") === "true";

  try {
    console.log('[Dashboard API] Starting queries', { userId: user?.id, orgId, projectId, isAllProjects });

    const projectFilter = !isAllProjects && projectId ? projectId : null;

    // Build queries
    let contactsQ = supabase
      .from("contacts")
      .select("id, temperature")
      .eq("organization_id", orgId)
      .is("deleted_at", null);

    let dealsQ = supabase
      .from("deals")
      .select("id, value, stage_id")
      .eq("organization_id", orgId)
      .is("deleted_at", null);

    let activitiesQ = supabase
      .from("activities")
      .select("id, type, description, created_at, contacts ( name )")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5);

    // Apply project filter if needed
    if (projectFilter) {
      contactsQ = contactsQ.eq("project_id", projectFilter);
      dealsQ = dealsQ.eq("project_id", projectFilter);
      activitiesQ = activitiesQ.eq("project_id", projectFilter);
    }

    // Execute all queries in parallel
    const startTime = Date.now();
    const [
      { data: allContacts, error: contactsError },
      { data: allDeals, error: dealsError },
      { data: stages, error: stagesError },
      { data: recentActivities, error: activitiesError },
    ] = await Promise.all([
      contactsQ,
      dealsQ,
      supabase
        .from("pipeline_stages")
        .select("id, name, color, is_won, is_lost")
        .eq("organization_id", orgId)
        .order("order"),
      activitiesQ,
    ]);
    
    const queryTime = Date.now() - startTime;
    console.log('[Dashboard API] Queries completed in', queryTime, 'ms');

    // Check for errors
    if (contactsError) {
      console.error('[Dashboard API] Contacts error:', contactsError);
      return NextResponse.json({ error: contactsError.message }, { status: 500 });
    }
    if (dealsError) {
      console.error('[Dashboard API] Deals error:', dealsError);
      return NextResponse.json({ error: dealsError.message }, { status: 500 });
    }
    if (stagesError) {
      console.error('[Dashboard API] Stages error:', stagesError);
      return NextResponse.json({ error: stagesError.message }, { status: 500 });
    }
    if (activitiesError) {
      console.error('[Dashboard API] Activities error:', activitiesError);
      return NextResponse.json({ error: activitiesError.message }, { status: 500 });
    }

    const contacts = allContacts ?? [];
    const deals = allDeals ?? [];
    const pipelineStages = stages ?? [];

    // Calculate stats
    const activeDeals = deals.filter((d) => {
      const stage = pipelineStages.find((s) => s.id === d.stage_id);
      return stage && !stage.is_won && !stage.is_lost;
    });

    const wonDeals = deals.filter((d) => {
      const stage = pipelineStages.find((s) => s.id === d.stage_id);
      return stage?.is_won;
    });

    const stats = {
      totalContacts: contacts.length,
      activeDeals: activeDeals.length,
      totalPipelineValue: activeDeals.reduce((sum, d) => sum + d.value, 0),
      wonDealsValue: wonDeals.reduce((sum, d) => sum + d.value, 0),
      conversionRate: deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 100) : 0,
      hotLeads: contacts.filter((c) => c.temperature === "hot").length,
    };

    // Build pipeline data
    const pipelineData = pipelineStages
      .filter((s) => !s.is_lost)
      .map((stage) => ({
        name: stage.name,
        count: deals.filter((d) => d.stage_id === stage.id).length,
        value: deals.filter((d) => d.stage_id === stage.id).reduce((sum, d) => sum + d.value, 0),
        color: stage.color,
      }));

    // Build activities
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activities = (recentActivities ?? []).map((a: any) => ({
      id: a.id,
      type: a.type,
      description: a.description,
      contactName: a.contacts?.name ?? null,
      createdAt: a.created_at,
    }));

    console.log('[Dashboard API] Data prepared successfully');

    return NextResponse.json({
      stats,
      pipelineData,
      activities,
      queryTime,
    });

  } catch (err) {
    console.error('[Dashboard API] Unexpected error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
