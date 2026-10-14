import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase-admin";
import { hashToken } from "@/lib/external-signature";
import FirmaExternaClient from "./FirmaExternaClient";

// Metadata para el preview de WhatsApp (que es como se manda este link):
// sin esto la tarjeta diria solo "Artist Pro" y el cliente no sabria si es
// spam. Solo el nombre del evento -- ni una cifra, porque el preview lo
// genera el servidor de WhatsApp y queda cacheado fuera de nuestro control.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: signer } = await admin
    .from("event_external_signers")
    .select("show_id, settlement_id")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!signer) return { title: "Link no válido — Artist Pro", robots: { index: false, follow: false } };

  // Link de una liquidación (migración 109): las partes, sin el monto.
  if (signer.settlement_id) {
    const { data: st } = await admin
      .from("settlements")
      .select("payer_name, payee_name")
      .eq("id", signer.settlement_id)
      .single();
    const title = st ? `Firma de liquidación — ${st.payer_name} → ${st.payee_name}` : "Firma de liquidación — Artist Pro";
    return {
      title,
      description: "Revisa la liquidación y firma tu conformidad. No necesitas crear una cuenta.",
      robots: { index: false, follow: false },
      openGraph: { title, description: "Revisa la liquidación y firma tu conformidad.", type: "website" },
    };
  }

  const { data: show } = await admin.from("shows").select("name").eq("id", signer.show_id).single();
  const title = show?.name ? `Firma de conformidad — ${show.name}` : "Firma de conformidad — Artist Pro";

  return {
    title,
    description: "Revisa el cierre de caja del evento y firma tu conformidad. No necesitas crear una cuenta.",
    // Un link de firma no tiene nada que hacer en Google.
    robots: { index: false, follow: false },
    openGraph: { title, description: "Revisa el cierre de caja del evento y firma tu conformidad.", type: "website" },
  };
}

export default function FirmaExternaPage() {
  return <FirmaExternaClient />;
}
