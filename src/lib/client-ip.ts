import { NextRequest } from "next/server";

// Railway (y la mayoría de PaaS) llegan detrás de un proxy -- el IP real
// del cliente va en x-forwarded-for, no en request.ip ni en headers
// estándar. Mismo criterio que ya usaba middleware.ts para el rate
// limiting; extraído acá para reusarlo también al registrar firmas
// (event_closing_signatures / settlement_signatures), donde el IP queda
// guardado como respaldo de quién firmó.
export function getClientIp(request: NextRequest | Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
