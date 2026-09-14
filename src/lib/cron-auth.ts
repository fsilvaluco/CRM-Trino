import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * Verifica el header `Authorization: Bearer <CRON_SECRET>` que manda Railway
 * Cron en cada uno de los endpoints /api/cron/*. Antes cada ruta comparaba
 * el header con `!==` -- una comparación de string normal es "short-circuit"
 * (corta apenas encuentra el primer caracter distinto), lo que en teoría
 * filtra el secreto caracter por caracter via el tiempo de respuesta (timing
 * attack). Estos endpoints no son de alto valor (no hay plata ni datos de
 * terceros expuestos directamente), pero el fix es gratis: `timingSafeEqual`
 * compara en tiempo constante.
 *
 * Devuelve `null` si está autorizado (seguir con el handler), o el
 * NextResponse de error que hay que retornar tal cual si no lo está --
 * mismo mensaje/status que ya devolvía cada ruta, para no cambiar el
 * contrato con Railway.
 */
export function verifyCronSecret(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  // timingSafeEqual exige buffers del mismo largo -- si difieren, ya sabemos
  // que no calzan (el largo en sí no es el secreto, no hace falta ocultarlo).
  const received = Buffer.from(authHeader);
  const expectedBuf = Buffer.from(expected);
  const matches = received.length === expectedBuf.length && timingSafeEqual(received, expectedBuf);

  if (!matches) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return null;
}
