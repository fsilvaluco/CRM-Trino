import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/supabase-server";
import { ActivityLogPanel } from "@/components/settings/ActivityLogPanel";

export const dynamic = "force-dynamic";

export default async function ActivityLogsPage() {
  const { supabase, user, isAdmin, error } = await requireAuth();

  if (error) redirect("/login");

  // Igual que `GET /api/activity-logs` (ROLES.md, ítem 17/18 del rediseño
  // de roles): no exclusivo de isAdmin de organización -- también entra
  // quien gestiona equipo en al menos un proyecto.
  if (!isAdmin) {
    const { data: managerRow } = await supabase
      .from("project_members")
      .select("id")
      .eq("user_id", user!.id)
      .eq("puede_gestionar_equipo", true)
      .limit(1)
      .maybeSingle();
    if (!managerRow) redirect("/settings");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Registro de actividad</h1>
        <p className="text-muted-foreground">
          Movimientos y acciones realizadas dentro de la aplicación.
        </p>
      </div>

      <ActivityLogPanel />
    </div>
  );
}
