import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTransaction(row: any) {
  return {
    id: row.id,
    type: row.type as "income" | "expense",
    amount: row.amount,
    currency: row.currency ?? "CLP",
    description: row.description ?? null,
    category: row.category ?? null,
    filePath: row.file_path ?? null,  // storage path, not public URL
    fileUrl: row.file_url ?? null,    // signed URL (populated at read time)
    fileName: row.file_name ?? null,
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
  const { supabase, orgId, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const type = searchParams.get("type"); // "income" | "expense"

  let query = supabase
    .from("transactions")
    .select("*")
    .eq("organization_id", orgId!)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (projectId) query = query.eq("project_id", projectId);
  if (type) query = query.eq("type", type);

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // Generar signed URLs para los archivos (válidas 1 hora)
  const rows = data ?? [];
  const withSignedUrls = await Promise.all(
    rows.map(async (row) => {
      const mapped = mapTransaction(row);
      if (row.file_path) {
        const { data: signed } = await supabase.storage
          .from("finances")
          .createSignedUrl(row.file_path, 3600);
        mapped.fileUrl = signed?.signedUrl ?? null;
      }
      return mapped;
    })
  );

  return NextResponse.json(withSignedUrls);
}

export async function POST(request: NextRequest) {
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { type, amount, currency = "CLP", description, category, filePath, fileName, responsibleUserId, responsibleName, reimbursed, transactionDate, projectId } = body;

  if (!type || !["income", "expense"].includes(type)) {
    return NextResponse.json({ error: "type debe ser 'income' o 'expense'" }, { status: 400 });
  }
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return NextResponse.json({ error: "amount debe ser un número positivo" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("transactions")
    .insert({
      organization_id: orgId,
      project_id: projectId ?? null,
      type,
      amount: Math.round(Number(amount)),
      currency,
      description: description ?? null,
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

  return NextResponse.json(mapTransaction(data), { status: 201 });
}
