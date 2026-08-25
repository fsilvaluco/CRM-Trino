import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { sendPushToUsers } from "@/lib/push";
import { isCostCategory } from "@/lib/cost-categories";
import { getProjectPermissions, canEditEventCosts } from "@/lib/project-roles";

function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

interface SubmissionProfile {
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface SubmissionRow {
  id: string;
  label: string;
  category: string | null;
  responsable: string | null;
  responsable_contact_id: string | null;
  amount: number;
  comprobante_url: string | null;
  notes: string | null;
  status: string;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  submitted_by: string;
  submitter: SubmissionProfile | null;
  reviewer: SubmissionProfile | null;
  km: number | null;
  km_rate: number | null;
}

function mapSubmission(r: SubmissionRow) {
  return {
    id: r.id,
    label: r.label,
    category: r.category,
    responsable: r.responsable,
    responsableContactId: r.responsable_contact_id,
    amount: r.amount,
    comprobanteUrl: r.comprobante_url,
    notes: r.notes,
    status: r.status,
    reviewNote: r.review_note,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
    submittedBy: r.submitted_by,
    submitterName: r.submitter?.full_name ?? r.submitter?.email ?? null,
    reviewerName: r.reviewer?.full_name ?? r.reviewer?.email ?? null,
    km: r.km ?? null,
    kmRate: r.km_rate ?? null,
  };
}

// GET /api/eventos/[id]/cost-submissions -- lista de gastos reportados.
// Quien puede revisar/aprobar (puede_editar + ve_costos de Eventos en ESE
// proyecto) ve todos; el resto solo ve los suyos (para hacer seguimiento a
// su propio envío). Antes esto era "isAdmin" (rol de ORGANIZACIÓN) -- se
// migró a la matriz de proyecto (ROLES.md, ítem 19 del rediseño de roles).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: show, error: showErr } = await supabase
    .from("shows")
    .select("id, project_id, cost_sheet_closed_at")
    .eq("id", id)
    .single();
  if (showErr || !show) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }
  if (!show.project_id) {
    return NextResponse.json({ error: "El evento no tiene proyecto asignado" }, { status: 400 });
  }
  if (!allowedProjectIds.includes(show.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este evento" }, { status: 403 });
  }

  const perm = await getProjectPermissions(supabase, user!.id, show.project_id);
  const canReview = canEditEventCosts(perm);

  let query = supabase
    .from("event_cost_submissions")
    .select(
      "id, label, category, responsable, responsable_contact_id, amount, comprobante_url, notes, status, review_note, reviewed_at, created_at, submitted_by, km, km_rate, submitter:profiles!event_cost_submissions_submitted_by_fkey ( full_name, email, avatar_url ), reviewer:profiles!event_cost_submissions_reviewed_by_fkey ( full_name, email, avatar_url )"
    )
    .eq("show_id", id)
    .order("created_at", { ascending: false });

  if (!canReview) {
    query = query.eq("submitted_by", user!.id);
  }

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({
    submissions: ((data ?? []) as unknown as SubmissionRow[]).map(mapSubmission),
    costSheetClosed: Boolean(show.cost_sheet_closed_at),
    canReview,
    currentUser: {
      id: user!.id,
      fullName: (user!.user_metadata?.full_name as string | undefined) ?? null,
      email: user!.email ?? null,
    },
  });
}

// POST /api/eventos/[id]/cost-submissions -- alguien del proyecto reporta
// un gasto (desde /eventos/[id]/gastos). Queda "pending" -- no toca
// event_cost_items hasta que un admin lo apruebe.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: show, error: showErr } = await supabase
    .from("shows")
    .select("id, name, project_id, cost_sheet_closed_at")
    .eq("id", id)
    .single();
  if (showErr || !show) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }
  if (!show.project_id) {
    return NextResponse.json({ error: "El evento no tiene proyecto asignado" }, { status: 400 });
  }
  if (!allowedProjectIds.includes(show.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este evento" }, { status: 403 });
  }
  if (show.cost_sheet_closed_at) {
    return NextResponse.json(
      { error: "La caja de este evento ya está cerrada -- no se pueden reportar más gastos." },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const {
    label,
    category,
    responsable,
    responsableContactId,
    amount,
    comprobanteUrl,
    notes,
    km,
    kmRate,
  } = body as {
    label?: string;
    category?: string | null;
    responsable?: string | null;
    responsableContactId?: string | null;
    amount?: number;
    comprobanteUrl?: string | null;
    notes?: string | null;
    km?: number | null;
    kmRate?: number | null;
  };

  const trimmedLabel = (label ?? "").trim();
  if (!trimmedLabel) {
    return NextResponse.json({ error: "Falta el detalle del gasto" }, { status: 400 });
  }
  if (!isCostCategory(category)) {
    return NextResponse.json({ error: "Selecciona una categoría" }, { status: 400 });
  }
  const cents = typeof amount === "number" && Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
  if (cents <= 0) {
    return NextResponse.json({ error: "El monto tiene que ser mayor a $0" }, { status: 400 });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("event_cost_submissions")
    .insert({
      show_id: id,
      submitted_by: user!.id,
      label: trimmedLabel,
      category,
      responsable: responsable || null,
      responsable_contact_id: responsableContactId || null,
      amount: cents,
      comprobante_url: comprobanteUrl || null,
      notes: notes || null,
      km: typeof km === "number" ? km : null,
      km_rate: typeof kmRate === "number" ? kmRate : null,
    })
    .select("id")
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Fire-and-forget: avisar a quienes pueden revisar gastos en ESTE
  // proyecto (puede_editar + ve_costos de Eventos) -- antes avisaba a
  // "admins de organización" sin importar si tenían algo que ver con este
  // proyecto puntual (ROLES.md, ítem 19 del rediseño de roles).
  const { data: projectMembers } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", show.project_id);
  const reviewerIds: string[] = [];
  for (const m of (projectMembers ?? []) as { user_id: string }[]) {
    if (m.user_id === user!.id) continue;
    const memberPerm = await getProjectPermissions(supabase, m.user_id, show.project_id);
    if (canEditEventCosts(memberPerm)) reviewerIds.push(m.user_id);
  }
  if (reviewerIds.length > 0) {
    void sendPushToUsers(reviewerIds, {
      title: "Nuevo gasto reportado",
      body: `${trimmedLabel} -- ${show.name}, pendiente de revisión`,
      url: siteUrl(`/eventos/${id}#costos`),
    });
  }

  return NextResponse.json({ ok: true, id: inserted.id }, { status: 201 });
}
