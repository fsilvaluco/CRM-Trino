import { NextRequest, NextResponse } from "next/server";
import { externalSignerStatus } from "@/lib/external-signature";
import { decryptLinkToken, isLinkTokenCryptoEnabled } from "@/lib/link-token-crypto";
import { loadSettlementForTeam, siteUrl } from "@/lib/settlement-access";

// GET /api/settlements/[id]/external-signers/[signerId]/link -- devuelve el
// link vigente para copiarlo (se descifra con LINK_TOKEN_SECRET, migración
// 104). Pide el mismo permiso que emitirlo: quien lo copia puede, en la
// práctica, firmar en nombre de la contraparte.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; signerId: string }> }
) {
  const { id, signerId } = await params;
  const ctx = await loadSettlementForTeam(id, "editar");
  if (ctx.error) return ctx.error;

  const { data: signer } = await ctx.supabase
    .from("event_external_signers")
    .select("id, token_encrypted, signed_at, revoked_at, invalidated_at, expires_at")
    .eq("id", signerId)
    .eq("settlement_id", id)
    .maybeSingle();

  if (!signer) return NextResponse.json({ error: "Link no encontrado" }, { status: 404 });

  const status = externalSignerStatus(signer);
  if (status !== "pendiente") {
    return NextResponse.json({ error: `Ese link está ${status} -- ya no sirve para firmar. Emite uno nuevo.` }, { status: 409 });
  }
  if (!signer.token_encrypted) {
    return NextResponse.json(
      {
        error: isLinkTokenCryptoEnabled()
          ? "Ese link no se puede copiar. Usa Reenviar para emitir uno nuevo."
          : "Falta configurar LINK_TOKEN_SECRET para poder copiar links.",
      },
      { status: 409 }
    );
  }

  const token = decryptLinkToken(signer.token_encrypted);
  if (!token) {
    return NextResponse.json({ error: "No se pudo recuperar ese link. Usa Reenviar para emitir uno nuevo." }, { status: 409 });
  }

  return NextResponse.json({ url: siteUrl(`/firmar/${token}`) });
}
