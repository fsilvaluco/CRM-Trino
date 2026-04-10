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
  });
}
