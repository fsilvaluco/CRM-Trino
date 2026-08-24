// Utilidades para acceder a archivos del bucket privado "finances" (comprobantes
// de gastos, pagos, préstamos, cierre de caja, etc.).
//
// El bucket es PRIVADO -- los archivos nunca deben servirse con una URL pública
// permanente. En su lugar, siempre se genera una URL firmada (createSignedUrl)
// que expira en 1 hora, tanto para archivos nuevos como para los que quedaron
// guardados en la base de datos con una URL pública de cuando el bucket era
// público (ver bitácora, corrección de seguridad del 23 ago 2026).

import { supabase } from "@/lib/supabase";

const PUBLIC_URL_MARKER = "/object/public/finances/";

/**
 * Extrae el path relativo dentro del bucket "finances" a partir de un valor
 * guardado que puede ser:
 * - un path relativo puro (ej. "cost-items/abc/def.png") -- se devuelve tal cual
 * - una URL pública vieja (ej. ".../storage/v1/object/public/finances/cost-items/abc/def.png")
 *   -- se le saca el path relativo
 */
export function extractFinancePath(urlOrPath: string): string {
  const idx = urlOrPath.indexOf(PUBLIC_URL_MARKER);
  if (idx === -1) return urlOrPath;
  return urlOrPath.slice(idx + PUBLIC_URL_MARKER.length);
}

/** Genera una URL firmada (1 hora) para un archivo del bucket "finances". */
export async function getFinanceSignedUrl(urlOrPath: string, expiresIn = 3600): Promise<string | null> {
  const path = extractFinancePath(urlOrPath);
  const { data, error } = await supabase.storage.from("finances").createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
