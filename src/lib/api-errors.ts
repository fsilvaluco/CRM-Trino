import { NextResponse } from "next/server";

/**
 * Respuesta de error genérica para fallos de base de datos -- el detalle
 * real (mensaje de Postgres/Supabase, que puede incluir nombres de columna,
 * de tabla, o detalles de constraints) se loguea server-side para debug,
 * pero al cliente solo le llega un mensaje genérico. Antes varios endpoints
 * devolvían `error.message` tal cual en la respuesta HTTP -- útil para
 * debuggear rápido, pero expone detalles internos del schema a cualquiera
 * que mire la respuesta (Bajo/Info del audit /cyber-neo, 23 ago 2026).
 *
 * `context` es solo para el log (ej. "org-members:POST upsert") -- no llega
 * nunca al cliente.
 */
export function dbErrorResponse(context: string, error: unknown, status = 500) {
  console.error(`[${context}]`, error);
  return NextResponse.json({ error: "Error interno del servidor. Intenta de nuevo." }, { status });
}
