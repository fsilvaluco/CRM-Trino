import { requireAuth } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
import { KPICards } from "@/components/dashboard/KPICards";
import { PipelineChart } from "@/components/dashboard/PipelineChart";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { NotificationBanner } from "@/components/dashboard/NotificationBanner";
import type { DashboardStats } from "@/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { supabase, user, orgId } = await requireAuth();

  if (!user || !orgId) redirect("/login");

  const [
    { data: allContacts },
    { data: allDeals },
    { data: stages },
    { data: recentActivities },
  ] = await Promise.all([
    supabase.from("contacts").select("id, temperature").eq("organization_id", orgId).is("deleted_at", null),
    supabase.from("deals").select("id, value, stage_id").eq("organization_id", orgId).is("deleted_at", null),
    supabase.from("pipeline_stages").select("id, name, color, is_won, is_lost").eq("organization_id", orgId).order("order"),
    supabase
      .from("activities")
      .select("id, type, description, created_at, contacts ( name )")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const contacts = allContacts ?? [];
  const deals = allDeals ?? [];
  const pipelineStages = stages ?? [];

  const activeDeals = deals.filter((d) => {
    const stage = pipelineStages.find((s) => s.id === d.stage_id);
    return stage && !stage.is_won && !stage.is_lost;
  });

  const wonDeals = deals.filter((d) => {
    const stage = pipelineStages.find((s) => s.id === d.stage_id);
    return stage?.is_won;
  });

  const stats: DashboardStats = {
    totalContacts: contacts.length,
    activeDeals: activeDeals.length,
    totalPipelineValue: activeDeals.reduce((sum, d) => sum + d.value, 0),
    wonDealsValue: wonDeals.reduce((sum, d) => sum + d.value, 0),
    conversionRate:
      deals.length > 0
        ? Math.round((wonDeals.length / deals.length) * 100)
        : 0,
    hotLeads: contacts.filter((c) => c.temperature === "hot").length,
  };

  const pipelineData = pipelineStages
    .filter((s) => !s.is_lost)
    .map((stage) => ({
      name: stage.name,
      count: deals.filter((d) => d.stage_id === stage.id).length,
      value: deals
        .filter((d) => d.stage_id === stage.id)
        .reduce((sum, d) => sum + d.value, 0),
      color: stage.color,
    }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activities = (recentActivities ?? []).map((a: any) => ({
    id: a.id,
    type: a.type,
    description: a.description,
    contactName: a.contacts?.name ?? null,
    createdAt: a.created_at,
  }));

  const isFirstRun = contacts.length === 0 && deals.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Resumen de tu pipeline de ventas
        </p>
      </div>

      {isFirstRun && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-semibold mb-2">
            Bienvenido a Trino-Control
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Tu CRM esta listo. Aqui tienes como comenzar:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="p-3 rounded-lg bg-card border">
              <p className="font-medium">1. Personaliza tu CRM</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ejecuta <code className="bg-muted px-1 rounded">/setup</code> en Claude Code
              </p>
            </div>
            <div className="p-3 rounded-lg bg-card border">
              <p className="font-medium">2. Agrega contactos</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ve a Contactos o usa <code className="bg-muted px-1 rounded">/add-lead</code>
              </p>
            </div>
            <div className="p-3 rounded-lg bg-card border">
              <p className="font-medium">3. Carga datos demo</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ejecuta <code className="bg-muted px-1 rounded">npm run seed:supabase</code> en terminal
              </p>
            </div>
          </div>
        </div>
      )}

      <NotificationBanner />

      <KPICards stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <PipelineChart data={pipelineData} />
        </div>
        <div>
          <RecentActivity activities={activities} />
        </div>
      </div>
    </div>
  );
}
