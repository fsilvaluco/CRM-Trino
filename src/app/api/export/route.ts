import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { SOURCE_LABELS } from "@/lib/constants";
import { getLocaleSettings } from "@/lib/locale-server";
import { formatCurrencyWith, formatDateWith } from "@/lib/locale";
import type { LeadSource } from "@/types";
import { getProjectPermissionsForMany, canViewModule, canViewDeals } from "@/lib/project-roles";

function escapeCSV(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCSV(headers: string[], rows: string[][]): string {
  const headerLine = headers.map(escapeCSV).join(",");
  const dataLines = rows.map((row) => row.map(escapeCSV).join(","));
  return [headerLine, ...dataLines].join("\n");
}

export async function GET(request: NextRequest) {
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "contacts";
  const today = new Date().toISOString().split("T")[0];
  const locale = getLocaleSettings();

  // Aislamiento entre proyectos + matriz de permisos (24 ago 2026 -- este
  // endpoint no ten\u00eda NING\u00daN chequeo de proyecto, exportaba TODA la
  // organizaci\u00f3n a cualquiera autenticado. Es la fuga m\u00e1s directa del
  // redise\u00f1o de roles: aunque la UI oculte un dato, el CSV se lo lleva
  // completo si no se filtra ac\u00e1 tambi\u00e9n -- ROLES.md 0.2, \u00edtem 9).
  if (allowedProjectIds.length === 0) {
    return new Response("Sin proyectos asignados", { status: 403 });
  }

  if (type === "contacts") {
    const { data: allContacts } = await supabase
      .from("contacts")
      .select("*")
      .is("deleted_at", null)
      .or(`project_id.in.(${allowedProjectIds.join(",")}),artist_project_id.in.(${allowedProjectIds.join(",")})`)
      .order("created_at", { ascending: false });

    const rows_ = allContacts ?? [];
    const permsByProject = await getProjectPermissionsForMany(
      supabase,
      user!.id,
      rows_.map((c) => c.project_id ?? c.artist_project_id).filter(Boolean)
    );
    const visibleContacts = rows_.filter((c) => {
      const pid = c.project_id ?? c.artist_project_id;
      return canViewModule(permsByProject.get(pid) ?? null, "contactos");
    });

    const headers = ["Nombre", "Email", "Telefono", "Empresa", "Fuente", "Temperatura", "Score", "Notas", "Fecha de creacion"];

    const rows = visibleContacts.map((c) => [
      c.name, c.email || "", c.phone || "", c.company || "",
      SOURCE_LABELS[c.source as LeadSource] || c.source,
      c.temperature === "hot" ? "Caliente" : c.temperature === "warm" ? "Tibio" : "Frio",
      String(c.score), c.notes || "",
      formatDateWith(c.created_at, locale),
    ]);

    const csv = buildCSV(headers, rows);
    return new Response("\ufeff" + csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="contactos-${today}.csv"` },
    });
  }

  if (type === "deals") {
    const { data: allDeals } = await supabase
      .from("deals")
      .select("title, value, probability, notes, expected_close, created_at, project_id, artist_project_id, contacts ( name ), pipeline_stages ( name )")
      .is("deleted_at", null)
      .or(`project_id.in.(${allowedProjectIds.join(",")}),artist_project_id.in.(${allowedProjectIds.join(",")})`)
      .order("created_at", { ascending: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows_ = (allDeals ?? []) as any[];
    const permsByProject = await getProjectPermissionsForMany(
      supabase,
      user!.id,
      rows_.map((d) => d.project_id ?? d.artist_project_id).filter(Boolean)
    );
    const visibleDeals = rows_.filter((d) => {
      const pid = d.project_id ?? d.artist_project_id;
      return canViewDeals(permsByProject.get(pid) ?? null);
    });

    const headers = ["Titulo", "Valor", "Contacto", "Etapa", "Probabilidad", "Cierre Estimado", "Notas", "Fecha de creacion"];

    const rows = visibleDeals.map((d) => {
      const pid = d.project_id ?? d.artist_project_id;
      const veIngresos = Boolean(permsByProject.get(pid)?.modules.deals.veIngresos);
      return [
        d.title, veIngresos ? formatCurrencyWith(d.value, locale) : "",
        d.contacts?.name || "", d.pipeline_stages?.name || "",
        `${d.probability}%`, formatDateWith(d.expected_close, locale),
        d.notes || "", formatDateWith(d.created_at, locale),
      ];
    });

    const csv = buildCSV(headers, rows);
    return new Response("\ufeff" + csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="deals-${today}.csv"` },
    });
  }

  return new Response("Tipo invalido. Use ?type=contacts o ?type=deals", { status: 400 });
}
