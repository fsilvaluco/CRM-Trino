import { supabase } from "@/lib/supabase";
import { PREESCUCHAS_BUCKET } from "@/lib/preescuchas";

// Subida de un archivo de Preescuchas desde el navegador: pide una URL
// firmada a /api/preescuchas/upload-url (que valida sesion y proyecto) y
// sube directo a Supabase Storage. Devuelve la ruta dentro del bucket.
export async function uploadPreescuchaFile(params: {
  projectId: string;
  preescuchaId: string;
  kind: "track" | "cover";
  blob: Blob;
  contentType: string;
}): Promise<string> {
  const res = await fetch("/api/preescuchas/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: params.projectId,
      preescuchaId: params.preescuchaId,
      kind: params.kind,
      contentType: params.contentType,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.path || !data.token) {
    throw new Error(data.error || "No se pudo preparar la subida");
  }

  const { error } = await supabase.storage
    .from(PREESCUCHAS_BUCKET)
    .uploadToSignedUrl(data.path, data.token, params.blob, { contentType: params.contentType });
  if (error) throw new Error(`Error al subir el archivo: ${error.message}`);

  return data.path as string;
}
