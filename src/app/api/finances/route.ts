import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { logActivity } from "@/lib/activity-logs";
import {
  getProjectPermissions,
  getProjectPermissionsForMany,
  canViewModule,
  canEditModule,
} from "@/lib/project-roles";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTransaction(row: any, veIngresos: boolean) {
  return {
    id: row.id,
    type: row.type as "income" | "expense",
    // Sin ve_ingresos en el módulo Finanzas de este proyecto: se oculta el
    // monto en la respuesta misma (ROLES.md 0.2.5) -- Finanzas usa un solo
    // flag de $ (no distingue ingreso/costo como Eventos).
    amount: veIngresos ? row.amount : null,
    currency: row.currency ?? "CLP",
    description: row.description ?? null,
    // Quién envió/recibió la plata -- separado de la descripción libre,
    // llenado a mano o autocompletado leyendo el comprobante con IA (ver
    // /api/finances/match-receipt, mismo extractor ya usado por "Adjuntar
    // comprobante (IA)").
    emisor: row.emisor ?? null,
    receptor: row.receptor ?? null,
    category: row.category ?? null,
    filePath: row.file_path ?? null,  // storage path, not public URL (legacy -- ver attachments)
    fileUrl: row.file_url ?? null,    // signed URL (populada al leer)
    fileName: row.file_name ?? null,
    // Comprobantes múltiples (una línea de presupuesto puede pagarse en
    // varias cuotas) -- populados abajo con URLs firmadas.
    attachments: [] as { id: string; fileName: string | null; fileUrl: string | null; createdAt: string }[],
    responsibleUserId: row.responsible_user_id ?? null,
    responsibleName: row.responsible_name ?? null,
    reimbursed: row.reimbursed ?? false,
    reimbursedAt: row.reimbursed_at ?? null,
    transactionDate: row.transaction_date ?? null,
    projectId: row.project_id ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  };
}

export async function GET(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const type = searchParams.get("type"); // "income" | "expense"

  // Aislamiento entre proyectos (24 ago 2026 -- este endpoint no tenía
  // NINGÚN chequeo de proyecto ni de rol; ver ROLES.md 0.2.5, era del mismo
  // nivel de urgencia que el bug del 23 ago). Nota: a diferencia de
  // Deals/Eventos, Finanzas NO agrupa proyecto madre + hijos -- son libros
  // separados (ROLES.md 0.2.5), por eso el filtro es `.eq` exacto, nunca
  // se expande a hijos.
  if (projectId && !allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }
  if (!projectId && allowedProjectIds.length === 0) {
    return NextResponse.json([]);
  }

  let query = supabase
    .from("transactions")
    .select("*")
    .eq("organization_id", orgId!)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  query = projectId ? query.eq("project_id", projectId) : query.in("project_id", allowedProjectIds);
  if (type) query = query.eq("type", type);

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // Cada fila puede pertenecer a un proyecto distinto en modo agregado --
  // la matriz se respeta por proyecto, no la del proyecto activo en el
  // selector (ROLES.md 0.5). Se calcula por lote (una consulta por
  // proyecto distinto, no por fila).
  const allRows = data ?? [];
  const permsByProject = await getProjectPermissionsForMany(
    supabase,
    user!.id,
    allRows.map((r) => r.project_id)
  );

  if (projectId && !canViewModule(permsByProject.get(projectId) ?? null, "finanzas")) {
    return NextResponse.json({ error: "Sin acceso a Finanzas para tu rol" }, { status: 403 });
  }

  const rows = allRows.filter((r) => canViewModule(permsByProject.get(r.project_id) ?? null, "finanzas"));

  // Comprobantes múltiples de todas las transacciones de una vez (evita
  // N+1 queries).
  const ids = rows.map((row) => row.id);
  const attachmentsByTransaction = new Map<string, { id: string; file_path: string; file_name: string | null; created_at: string }[]>();
  if (ids.length > 0) {
    const { data: attachmentRows } = await supabase
      .from("transaction_attachments")
      .select("id, transaction_id, file_path, file_name, created_at")
      .in("transaction_id", ids)
      .order("created_at", { ascending: true });
    for (const a of attachmentRows ?? []) {
      const list = attachmentsByTransaction.get(a.transaction_id) ?? [];
      list.push(a);
      attachmentsByTransaction.set(a.transaction_id, list);
    }
  }

  // Generar signed URLs para los archivos (válidas 1 hora) -- solo si
  // ve_ingresos: sin eso, ni el monto ni el comprobante quedan visibles
  // (ROLES.md 0.2.4, "los archivos adjuntos heredan el permiso de $").
  const withSignedUrls = await Promise.all(
    rows.map(async (row) => {
      const veIngresos = Boolean(permsByProject.get(row.project_id)?.modules.finanzas.veIngresos);
      const mapped = mapTransaction(row, veIngresos);
      if (!veIngresos) return mapped;
      if (row.file_path) {
        const { data: signed } = await supabase.storage
          .from("finances")
          .createSignedUrl(row.file_path, 3600);
        mapped.fileUrl = signed?.signedUrl ?? null;
      }
      const attachments = attachmentsByTransaction.get(row.id) ?? [];
      mapped.attachments = await Promise.all(
        attachments.map(async (a) => {
          const { data: signed } = await supabase.storage
            .from("finances")
            .createSignedUrl(a.file_path, 3600);
          return { id: a.id, fileName: a.file_name, fileUrl: signed?.signedUrl ?? null, createdAt: a.created_at };
        })
      );
      return mapped;
    })
  );

  return NextResponse.json(withSignedUrls);
}

export async function POST(request: NextRequest) {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { type, amount, currency = "CLP", description, emisor, receptor, category, filePath, fileName, responsibleUserId, responsibleName, reimbursed, transactionDate, projectId } = body;

  if (!type || !["income", "expense"].includes(type)) {
    return NextResponse.json({ error: "type debe ser 'income' o 'expense'" }, { status: 400 });
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return NextResponse.json({ error: "amount debe ser un número positivo" }, { status: 400 });
  }
  // `transactions.project_id` es NOT NULL desde la migración 084 (ROLES.md
  // 0.2.5) -- toda transacción pertenece a un proyecto, sin excepción.
  if (!projectId) {
    return NextResponse.json({ error: "projectId requerido" }, { status: 400 });
  }
  if (!allowedProjectIds.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 });
  }
  const perm = await getProjectPermissions(supabase, user!.id, projectId);
  if (!canEditModule(perm, "finanzas")) {
    return NextResponse.json({ error: "Tu rol no puede crear movimientos en Finanzas de este proyecto" }, { status: 403 });
  }

  const { data, error: dbError } = await supabase
    .from("transactions")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      type,
      amount: Math.round(Number(amount)),
      currency,
      description: description ?? null,
      emisor: emisor ?? null,
      receptor: receptor ?? null,
      category: category ?? null,
      file_path: filePath ?? null,         // storage path
      file_url: null,                       // not stored, generated at read time
      file_name: fileName ?? null,
      responsible_user_id: responsibleUserId ?? null,
      responsible_name: responsibleName ?? null,
      reimbursed: reimbursed === true,
      reimbursed_at: reimbursed === true ? new Date().toISOString() : null,
      transaction_date: transactionDate ?? null,
      created_by: user!.id,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await logActivity({
    supabase,
    userId: user!.id,
    userEmail: user!.email,
    action: "create",
    entityType: "transaction",
    entityId: data.id,
    entityName: data.description ?? `${data.type === "income" ? "Ingreso" : "Gasto"} $${data.amount}`,
    projectId: data.project_id,
  });

  return NextResponse.json(mapTransaction(data, Boolean(perm?.modules.finanzas.veIngresos)), { status: 201 });
}
