import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getFlowPaymentStatus, FLOW_PAYMENT_STATUS } from "@/lib/flow";

// Flow llama esto SIN sesion de usuario (es un servidor a servidor), por
// eso usa el cliente admin, no requireAuth(). Ademas exige responder 200
// en menos de 15 segundos -- por eso esto no hace nada pesado, solo
// consulta el estado real y actualiza una fila.
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const token = formData.get("token") as string | null;

  if (!token) {
    // Responder 200 igual -- Flow reintenta si no recibe 200, y un token
    // faltante no se va a arreglar reintentando.
    return NextResponse.json({ ok: true });
  }

  try {
    // Nunca confiar en un status que venga directo del webhook -- Flow
    // solo entrega el token aqui a proposito, para evitar que alguien
    // falsifique una notificacion. El estado real SIEMPRE se pide aparte.
    const status = await getFlowPaymentStatus(token);

    const supabase = createAdminClient();
    const statusLabel =
      status.status === FLOW_PAYMENT_STATUS.PAID
        ? "paid"
        : status.status === FLOW_PAYMENT_STATUS.REJECTED
          ? "rejected"
          : status.status === FLOW_PAYMENT_STATUS.CANCELED
            ? "expired"
            : "pending";

    await supabase
      .from("billing_payments")
      .update({
        status: statusLabel,
        payment_method: status.paymentData?.media ?? null,
        paid_at: statusLabel === "paid" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("flow_token", token);
  } catch (err) {
    console.error("[billing/webhook] error procesando confirmacion de Flow", err);
    // Aun asi respondemos 200 -- si devolvemos error, Flow reintenta, y
    // si el problema es persistente (ej. token invalido) reintentar no
    // ayuda. Queda registrado en logs para revisar a mano.
  }

  return NextResponse.json({ ok: true });
}
