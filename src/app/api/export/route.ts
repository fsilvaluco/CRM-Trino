import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { SOURCE_LABELS } from "@/lib/constants";
import { getLocaleSettings } from "@/lib/locale-server";
import { formatCurrencyWith, formatDateWith } from "@/lib/locale";
import type { LeadSource } from "@/types";

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
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "contacts";
  const today = new Date().toISOString().split("T")[0];
  const locale = getLocaleSettings();

  if (type === "contacts") {
    const { data: allContacts } = await supabase
      .from("contacts").select("*").is("deleted_at", null).order("created_at", { ascending: false });

    const headers = ["Nombre", "Email", "Telefono", "Empresa", "Fuente", "Temperatura", "Score", "Notas", "Fecha de creacion"];

    const rows = (allContacts ?? []).map((c) => [
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
      .select("title, value, probability, notes, expected_close, created_at, contacts ( name ), pipeline_stages ( name )")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    const headers = ["Titulo", "Valor", "Contacto", "Etapa", "Probabilidad", "Cierre Estimado", "Notas", "Fecha de creacion"];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (allDeals ?? []).map((d: any) => [
      d.title, formatCurrencyWith(d.value, locale),
      d.contacts?.name || "", d.pipeline_stages?.name || "",
      `${d.probability}%`, formatDateWith(d.expected_close, locale),
      d.notes || "", formatDateWith(d.created_at, locale),
    ]);

    const csv = buildCSV(headers, rows);
    return new Response("\ufeff" + csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="deals-${today}.csv"` },
    });
  }

  return new Response("Tipo invalido. Use ?type=contacts o ?type=deals", { status: 400 });
}
