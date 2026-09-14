import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness check público, sin auth -- solo confirma que el servidor Next.js
 * está arriba y respondiendo (no verifica la base de datos a propósito: un
 * healthcheck que depende de la DB puede tumbar el contenedor en un reinicio
 * en cascada si Supabase tiene un hiccup momentáneo). Usado por el
 * HEALTHCHECK del Dockerfile.
 */
export async function GET() {
  return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
}
