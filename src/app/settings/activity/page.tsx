import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface ActivityLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  project_id: string | null;
  created_at: string;
}

export default async function ActivityLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; userId?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, isAdmin, error } = await requireAuth();

  if (error) redirect("/login");
  if (!isAdmin) redirect("/settings");

  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const userId = sp.userId ?? "";

  let query = supabase
    .from("activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);
  if (userId) query = query.eq("user_id", userId);

  const { data: logs, error: logsError } = await query;

  const { data: usersData } = await supabase
    .from("activity_logs")
    .select("user_id, user_email")
    .order("user_email")
    .limit(1000);

  const userMap = new Map<string, string | null>();
  (usersData ?? []).forEach((u) => {
    if (u.user_id && !userMap.has(u.user_id)) {
      userMap.set(u.user_id, u.user_email);
    }
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Registro de actividad</h1>
        <p className="text-sm text-gray-500">
          Movimientos y acciones realizadas dentro de la aplicación.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-4 rounded-lg border bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="from">
            Desde
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={from}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="to">
            Hasta
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={to}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="userId">
            Usuario
          </label>
          <select
            id="userId"
            name="userId"
            defaultValue={userId}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Todos los usuarios</option>
            {Array.from(userMap.entries()).map(([id, email]) => (
              <option key={id} value={id}>
                {email ?? id}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Filtrar
        </button>
      </form>

      {logsError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Error al cargar los logs: {logsError.message}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Acción</th>
                <th className="px-4 py-3">Entidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs && logs.length > 0 ? (
                logs.map((log: ActivityLog) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {new Date(log.created_at).toLocaleString("es-CL", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {log.user_email ?? log.user_id ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{log.action}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {log.entity_name ? (
                        <>
                          <span className="font-medium">{log.entity_name}</span>
                          <span className="ml-2 text-xs text-gray-500">
                            {log.entity_type}
                            {log.entity_id ? ` #${log.entity_id.slice(0, 8)}` : ""}
                          </span>
                        </>
                      ) : (
                        `${log.entity_type}${log.entity_id ? ` #${log.entity_id.slice(0, 8)}` : ""}`
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No hay registros para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
