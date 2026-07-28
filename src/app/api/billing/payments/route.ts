import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function GET() {
  const { supabase, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) {
    return NextResponse.json({ error: "Solo Admin o Propietario pueden ver la facturación" }, { status: 403 });
  }

  const { data, error: dbError } = await supabase
    .from("billing_payments")
    .select("*")
    .eq("organization_id", orgId!)
    .order("created_at", { ascending: false })
    .limit(50);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json(
    (data ?? []).map((p) => ({
      id: p.id,
      subject: p.subject,
      amount: p.amount,
      status: p.status,
      paymentMethod: p.payment_method,
      createdAt: p.created_at,
    }))
  );
}
