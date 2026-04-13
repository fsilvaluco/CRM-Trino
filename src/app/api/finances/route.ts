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
    fileUrl: row.file_url ?? null,
    fileName: row.file_name ?? null,
    responsibleUserId: row.responsible_user_id ?? null,
    responsibleName: row.responsible_name ?? null,
    reimbursed: row.reimbursed ?? false,
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

  return NextResponse.json((data ?? []).map(mapTransaction));
}

export async function POST(request: NextRequest) {
  const { supabase, user, orgId, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { type, amount, currency = "CLP", description, category, fileUrl, fileName, responsibleUserId, responsibleName, projectId } = body;

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
      file_url: fileUrl ?? null,
      file_name: fileName ?? null,
      responsible_user_id: responsibleUserId ?? null,
      responsible_name: responsibleName ?? null,
      reimbursed: false,
      created_by: user!.id,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json(mapTransaction(data), { status: 201 });
}
