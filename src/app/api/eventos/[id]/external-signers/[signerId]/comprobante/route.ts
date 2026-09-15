import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canViewEventCosts } from "@/lib/project-roles";
import { buildReceiptPdf } from "@/lib/external-signature";

// GET /api/eventos/[id]/external-signers/[signerId]/comprobante -- el mismo
// PDF que recibió el firmante, para el equipo (que no tiene el token del
// link). Se arma desde `document_snapshot`, no desde el cierre actual.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; signerId: string }> }
) {
  const { id, signerId } = await params;
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: show } = await supabase.from("shows").select("id, project_id").eq("id", id).single();
  if (!show) return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  if (!show.project_id || !allowedProjectIds.includes(show.project_id)) {
    return NextResponse.json({ error: "Sin acceso a este evento" }, { status: 403 });
  }

  const perm = await getProjectPermissions(supabase, user!.id, show.project_id);
  if (!canViewEventCosts(perm)) {
    return NextResponse.json({ error: "Sin acceso a los costos de este evento" }, { status: 403 });
  }

  const { data: signer } = await supabase
    .from("event_external_signers")
    .select(
      "role_label, created_at, first_viewed_at, signed_at, signer_name, signer_rut, signer_email, signer_phone, otp_sent_to, otp_verified_at, ip_address, user_agent, document_hash, document_snapshot"
    )
    .eq("id", signerId)
    .eq("show_id", id)
    .single();

  if (!signer || !signer.signed_at || !signer.document_snapshot) {
    return NextResponse.json({ error: "Ese link todavía no se firmó" }, { status: 404 });
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
