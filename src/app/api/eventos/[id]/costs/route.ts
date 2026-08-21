import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { isCostCategory } from "@/lib/cost-categories";
import { getProjectRole, canViewEventCosts, canEditEventCosts } from "@/lib/project-roles";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, isAdmin, error } = await requireAuth();
  if (error) return error;

  const { data: show } = await supabase.from("shows").select("project_id").eq("id", id).single();
  const role = await getProjectRole(supabase, user!.id, show?.project_id ?? null);
  if (!canViewEventCosts(isAdmin, role)) {
    return NextResponse.json({ error: "Sin acceso a los costos de este evento" }, { status: 403 });
  }

  const { data, error: dbError } = await supabase
    .from("event_cost_items")
    .select("*")
    .eq("show_id", id)
    .order("position");

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json(
    (data ?? []).map((r) => ({
      id: r.id,
      position: r.position,
      label: r.label,
      category: r.category ?? null,
      responsable: r.responsable ?? null,
      responsableContactId: r.responsable_contact_id ?? null,
      comprobanteUrl: r.comprobante_url ?? null,
      pagado: r.pagado ?? false,
      comprobantePagoUrl: r.comprobante_pago_url ?? null,
      esBhe: r.es_bhe ?? false,
      liquidoAmount: r.liquido_amount ?? null,
      amount: r.amount,
      notes: r.notes ?? null,
      km: r.km ?? null,
      kmRate: r.km_rate ?? null,
    }))
  );
}

// PUT /api/eventos/[id]/costs -- misma lógica de guardado completo que el
// setlist (ver ese archivo para el porqué).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;

  const { data: show } = await supabase.from("shows").select("cost_sheet_closed_at, project_id").eq("id", id).single();
  const role = await getProjectRole(supabase, user!.id, show?.project_id ?? null);
  if (!canEditEventCosts(isAdmin, role)) {
    return NextResponse.json({ error: "Tu rol no puede editar los costos de este evento" }, { status: 403 });
  }
  if (show?.cost_sheet_closed_at) {
    return NextResponse.json(
      { error: "La caja de este evento está cerrada. Reábrela primero para editar los costos." },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];

  const { data: existing } = await supabase
    .from("event_cost_items")
    .select("id")
    .eq("show_id", id);

  const existingIds = new Set((existing ?? []).map((r) => r.id));
  const keptIds = new Set(
    items.filter((it: { id?: string }) => it.id).map((it: { id: string }) => it.id)
  );
  const toDelete = [...existingIds].filter((eid) => !keptIds.has(eid));

  if (toDelete.length > 0) {
    await supabase.from("event_cost_items").delete().in("id", toDelete);
  }

  const rows = items.map(
    (
      it: {
        id?: string;
        label: string;
        category?: string | null;
        amount?: number;
        notes?: string | null;
        responsable?: string | null;
        responsableContactId?: string | null;
        comprobanteUrl?: string | null;
        pagado?: boolean;
        comprobantePagoUrl?: string | null;
        esBhe?: boolean;
        liquidoAmount?: number | null;
        km?: number | null;
        kmRate?: number | null;
      },
      index: number
    ) => ({
      ...(it.id ? { id: it.id } : { id: crypto.randomUUID() }),
      show_id: id,
      position: index,
      label: (it.label ?? "").trim() || "Sin título",
      category: isCostCategory(it.category) ? it.category : null,
      amount: typeof it.amount === "number" ? it.amount : 0,
      notes: it.notes || null,
      responsable: it.responsable || null,
      responsable_contact_id: it.responsableContactId || null,
      comprobante_url: it.comprobanteUrl || null,
      pagado: it.pagado ?? false,
      comprobante_pago_url: it.comprobantePagoUrl || null,
      es_bhe: it.esBhe ?? false,
      liquido_amount: typeof it.liquidoAmount === "number" ? it.liquidoAmount : null,
      km: typeof it.km === "number" ? it.km : null,
      km_rate: typeof it.kmRate === "number" ? it.kmRate : null,
    })
  );

  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from("event_cost_items").upsert(rows);
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

    // Catálogo crece solo: cualquier "Detalle" nuevo que no exista todavía
    // (comparación sin distinguir mayúsculas/minúsculas) queda guardado
    // para sugerirse la próxima vez, en cualquier proyecto de la org.
    const labels: string[] = [
      ...new Set<string>(
        rows
          .map((r: { label: string }) => r.label)
          .filter((l: string): l is string => Boolean(l) && l !== "Sin título")
      ),
    ];
    for (const label of labels) {
      const { data: existingType } = await supabase
        .from("cost_item_types")
        .select("id")
        .eq("organization_id", orgId!)
        .ilike("name", label)
        .maybeSingle();
      if (!existingType) {
        await supabase.from("cost_item_types").insert({ organization_id: orgId, name: label });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
