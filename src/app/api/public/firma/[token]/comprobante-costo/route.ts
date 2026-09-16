import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { hashToken, externalSignerStatus } from "@/lib/external-signature";
import { extractFinancePath } from "@/lib/finance-files";

// GET /api/public/firma/[token]/comprobante-costo?path=... -- URL firmada
// (5 min) de la boleta/factura de UN costo del cierre que este link está
// firmando. Es la contraparte pública de SignedFileLink, que no sirve acá
// porque el firmante externo no tiene sesión.
//
// Tres candados, porque esto abre un bucket privado a alguien anónimo:
//  1. El token del link tiene que existir y estar vigente (no vencido ni
//     anulado) -- un link muerto no abre ni un archivo.
//  2. El `path` pedido tiene que pertenecer a un costo DE ESE evento. Sin
//     esto, quien tenga un link podría pedir cualquier archivo del bucket
//     (comprobantes de otros proyectos, liquidaciones, préstamos).
//  3. La URL firmada dura 5 minutos, no una hora: es para mirarla ahora,
//     no para repartirla.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const path = request.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });

  const admin = createAdminClient();

  const { data: signer } = await admin
    .from("event_external_signers")
    .select("show_id, signed_at, revoked_at, invalidated_at, expires_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!signer) return NextResponse.json({ error: "Link no válido" }, { status: 404 });

  const status = externalSignerStatus(signer);
  if (status === "revocado" || status === "vencido" || status === "invalidado") {
    return NextResponse.json({ error: "Este link ya no está vigente" }, { status: 410 });
  }

  // El path guardado puede ser relativo o una URL pública vieja (ver
  // extractFinancePath) -- se compara contra las dos formas para no fallar
  // con los costos cargados antes de que el bucket pasara a privado.
  const { data: costItems } = await admin
    .from("event_cost_items")
    .select("comprobante_url")
    .eq("show_id", signer.show_id);

  const pertenece = (costItems ?? []).some(
    (c: { comprobante_url: string | null }) =>
      c.comprobante_url && (c.comprobante_url === path || extractFinancePath(c.comprobante_url) === extractFinancePath(path))
  );

  if (!pertenece) {
    return NextResponse.json({ error: "Ese comprobante no es de este cierre" }, { status: 403 });
  }

  const { data, error } = await admin.storage
    .from("finances")
    .createSignedUrl(extractFinancePath(path), 300);

  if (error || !data?.signedUrl) {
    console.error("[firma-externa:comprobante-costo]", error);
    return NextResponse.json({ error: "No se pudo abrir el comprobante" }, { status: 502 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
