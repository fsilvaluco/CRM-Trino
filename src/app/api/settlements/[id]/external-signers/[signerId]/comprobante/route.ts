import { NextRequest, NextResponse } from "next/server";
import { buildSettlementReceiptPdf } from "@/lib/settlement-document";
import { loadSettlementForTeam } from "@/lib/settlement-access";

// GET /api/settlements/[id]/external-signers/[signerId]/comprobante -- el
// mismo PDF que recibió la contraparte, para el equipo. Se arma desde el
// snapshot firmado, no desde la liquidación actual.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; signerId: string }> }
) {
  const { id, signerId } = await params;
  const ctx = await loadSettlementForTeam(id, "ver");
  if (ctx.error) return ctx.error;

  const { data: signer } = await ctx.supabase
    .from("event_external_signers")
    .select(
      "role_label, created_at, first_viewed_at, signed_at, signer_name, signer_rut, signer_email, signer_phone, otp_sent_to, otp_verified_at, ip_address, user_agent, document_hash, document_snapshot"
    )
    .eq("id", signerId)
    .eq("settlement_id", id)
    .maybeSingle();

  if (!signer || !signer.signed_at || !signer.document_snapshot) {
    return NextResponse.json({ error: "Ese link todavía no se firmó" }, { status: 404 });
  }

  const pdf = await buildSettlementReceiptPdf(signer.document_snapshot, {
    signerName: signer.signer_name,
    signerRut: signer.signer_rut,
    signerEmail: signer.signer_email,
    signerPhone: signer.signer_phone,
    roleLabel: signer.role_label ?? null,
    signedAt: signer.signed_at,
    otpVerifiedAt: signer.otp_verified_at ?? null,
    otpSentTo: signer.otp_sent_to ?? null,
    ipAddress: signer.ip_address ?? null,
    userAgent: signer.user_agent ?? null,
    linkCreatedAt: signer.created_at ?? null,
    firstViewedAt: signer.first_viewed_at ?? null,
    documentHash: signer.document_hash ?? "",
  });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="comprobante-liquidacion.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
