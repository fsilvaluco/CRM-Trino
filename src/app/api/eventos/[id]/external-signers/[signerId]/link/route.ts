import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canEditEventCosts } from "@/lib/project-roles";
import { externalSignerStatus } from "@/lib/external-signature";
import { decryptLinkToken, isLinkTokenCryptoEnabled } from "@/lib/link-token-crypto";

function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

// GET /api/eventos/[id]/external-signers/[signerId]/link -- devuelve el link
// de firma para copiarlo y mandárselo al cliente por WhatsApp.
//
// El token se descifra con la llave de LINK_TOKEN_SECRET (migración 104);
// en la base solo hay ciphertext y el SHA-256. Pide el mismo permiso que
// emitir el link, no menos: quien puede copiarlo puede, en la práctica,
// firmar haciéndose pasar por el cliente.
//
// Solo para links EN PIE: uno firmado ya se gastó, y uno vencido, anulado o
// invalidado por reapertura no sirve para nada -- en esos casos el camino
// es emitir uno nuevo.
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
  if (!canEditEventCosts(perm)) {
    return NextResponse.json({ error: "Tu rol no puede ver los links de firma de este evento" }, { status: 403 });
  }

  const { data: signer } = await supabase
    .from("event_external_signers")
    .select("id, token_encrypted, signed_at, revoked_at, invalidated_at, expires_at")
    .eq("id", signerId)
    .eq("show_id", id)
    .single();

  if (!signer) return NextResponse.json({ error: "Link no encontrado" }, { status: 404 });

  const status = externalSignerStatus(signer);
  if (status !== "pendiente") {
    return NextResponse.json(
      { error: `Ese link está ${status} -- ya no sirve para firmar. Emite uno nuevo.` },
      { status: 409 }
    );
  }

  if (!signer.token_encrypted) {
    return NextResponse.json(
      {
        error: isLinkTokenCryptoEnabled()
          ? "Ese link se emitió antes de que se pudiera copiar. Usa Reenviar para emitir uno nuevo."
          : "Falta configurar LINK_TOKEN_SECRET para poder copiar links.",
      },
      { status: 409 }
    );
  }

  const token = decryptLinkToken(signer.token_encrypted);
  if (!token) {
    return NextResponse.json(
      { error: "No se pudo recuperar ese link. Usa Reenviar para emitir uno nuevo." },
      { status: 409 }
    );
  }

  return NextResponse.json({ url: siteUrl(`/firmar/${token}`) });
}
