import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createFlowPayment } from "@/lib/flow";

export async function POST(request: NextRequest) {
  const { supabase, orgId, isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) {
    return NextResponse.json({ error: "Solo Admin o Propietario pueden generar cobros" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { subject, amount, email } = body as { subject?: string; amount?: number; email?: string };

  if (!subject || !amount || !email) {
    return NextResponse.json({ error: "Faltan subject, amount o email" }, { status: 400 });
  }

  // commerceOrder debe ser unico -- usamos un uuid corto + timestamp para
  // no tener que coordinar un contador.
  const commerceOrder = `ap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://artistpro.app";

  try {
    const result = await createFlowPayment({
      commerceOrder,
      subject,
      amount,
      email,
      urlConfirmation: `${siteUrl}/api/billing/webhook`,
      urlReturn: `${siteUrl}/settings/billing?pago=procesado`,
    });

    const { error: dbError } = await supabase.from("billing_payments").insert({
      organization_id: orgId,
      commerce_order: commerceOrder,
      flow_token: result.token,
      flow_order: result.flowOrder,
      subject,
      amount,
      status: "pending",
    });

    if (dbError) {
      return NextResponse.json({ error: `Pago creado en Flow pero no se pudo guardar: ${dbError.message}` }, { status: 500 });
    }

    return NextResponse.json({ paymentUrl: `${result.url}?token=${result.token}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido al crear el pago";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
