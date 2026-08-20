import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/supabase-server";
import { ActivityLogPanel } from "@/components/settings/ActivityLogPanel";

export const dynamic = "force-dynamic";

export default async function ActivityLogsPage() {
  const { isAdmin, error } = await requireAuth();

  if (error) redirect("/login");
  if (!isAdmin) redirect("/settings");

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
