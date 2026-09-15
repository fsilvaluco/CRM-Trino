import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { hashToken, buildReceiptPdf } from "@/lib/external-signature";

// GET /api/public/firma/[token]/comprobante -- descarga el PDF de una firma
// ya registrada. Se arma desde `document_snapshot` (el documento tal cual
// estaba al firmar), NO desde el cierre actual: el comprobante tiene que
// seguir mostrando lo mismo aunque después se haya reabierto la caja.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: signer } = await admin
    .from("event_external_signers")
    .select(
      "role_label, created_at, first_viewed_at, signed_at, signer_name, signer_rut, signer_email, signer_phone, otp_sent_to, otp_verified_at, ip_address, user_agent, document_hash, document_snapshot"
    )
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!signer || !signer.signed_at || !signer.document_snapshot) {
    return NextResponse.json({ error: "Todavía no hay una firma registrada en este link" }, { status: 404 });
  }

  const pdf = await buildReceiptPdf(signer.document_snapshot, {
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
      "Content-Disposition": `inline; filename="comprobante-firma.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
