import { toast } from "sonner";
import { compressImage } from "@/lib/image-compress";
import { readFileAsBase64 } from "../utils";

// Lectura con IA de un archivo (imagen, PDF o .txt) contra uno de los
// endpoints de extracción (/api/eventos/setlist-extract, timing-extract).
// Devuelve el JSON de la respuesta, o null si hubo error (ya avisado con
// toast). Mismos mensajes y cuerpos que antes del refactor.
export async function extractFromFile(endpoint: string, file: File): Promise<Record<string, unknown> | null> {
  const lowerName = file.name.toLowerCase();
  let body: Record<string, unknown>;
  let errorMessage: string;
  if (file.type.startsWith("image/")) {
    const { base64, mediaType } = await compressImage(file);
    body = { mode: "image", imageBase64: base64, mediaType };
    errorMessage = "No se pudo leer la imagen";
  } else if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
    const pdfBase64 = await readFileAsBase64(file);
    body = { mode: "pdf", pdfBase64 };
    errorMessage = "No se pudo leer el PDF";
  } else if (file.type === "text/plain" || lowerName.endsWith(".txt")) {
    const text = await file.text();
    body = { mode: "text", text };
    errorMessage = "No se pudo leer el archivo";
  } else {
    toast.error("Formato no soportado -- sube una imagen, PDF o .txt");
    return null;
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    toast.error(data?.error ?? errorMessage);
    return null;
  }
  return data;
}

// Lo mismo pero para texto pegado directamente en el textarea.
export async function extractFromText(endpoint: string, text: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "text", text }),
  });
  const data = await res.json();
  if (!res.ok) {
    toast.error(data?.error ?? "No se pudo leer el texto");
    return null;
  }
  return data;
}
