import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(no definida)";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return NextResponse.json({
    status: "ok",
    supabase_url: url,
    anon_key_length: key.length,
    anon_key_preview: key ? `${key.slice(0, 10)}...${key.slice(-6)}` : "(vacía)",
    // Diagnostico temporal push -- solo presencia/largo, nunca el valor.
    // TODO: sacar una vez confirmado que las 3 variables VAPID llegan bien.
    push_debug: {
      vapid_public_present: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      vapid_public_length: (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "").length,
      vapid_private_present: Boolean(process.env.VAPID_PRIVATE_KEY),
      vapid_subject_present: Boolean(process.env.VAPID_SUBJECT),
    },
  });
}
