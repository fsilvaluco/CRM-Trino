import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { ShowStatus } from "@/types/shows";
import type { TicketsSource } from "./types";

export const TICKETS_SOURCE_LABEL: Record<TicketsSource, string> = {
  pantallazo: "pantallazo leído con IA",
  link: "sincronizado del link",
  manual: "cargado a mano",
};

export function normalizeTicketsSource(value: unknown): TicketsSource {
  return value === "pantallazo" || value === "link" ? value : "manual";
}

// Después de una semana sin tocarse, los números de entradas vendidas ya no
// sirven para tomar decisiones -- se avisa en ámbar.
export const TICKETS_STALE_DAYS = 7;

const STATUS_CONFIG: Record<ShowStatus, { label: string; className: string }> = {
  cotizando: { label: "Cotizando", className: "bg-yellow-100 text-yellow-700" },
  confirmado: { label: "Confirmado", className: "bg-blue-100 text-blue-700" },
  realizado: { label: "Realizado", className: "bg-green-100 text-green-700" },
  cancelado: { label: "Cancelado", className: "bg-red-100 text-red-700" },
};

// Un status desconocido que venga de la base no debe botar la pagina.
export function getStatusConfig(status: string): { label: string; className: string } {
  return STATUS_CONFIG[status as ShowStatus] ?? { label: status, className: "bg-muted text-muted-foreground" };
}

const CLP = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return CLP.format(cents / 100);
}

export function formatDate(d: string) {
  try {
    return format(new Date(`${d}T00:00:00`), "EEEE d MMM yyyy", { locale: es });
  } catch {
    return d;
  }
}

// Fecha y hora corta usada en toda la página ("3 nov 2026, 14:30").
export function formatDateTime(d: string) {
  return format(new Date(d), "d MMM yyyy, HH:mm", { locale: es });
}

// El campo `address` suele venir de Google Places como direccion completa
// (calle, comuna, region, pais...). Para el encabezado de impresion solo
// queremos "calle n°, comuna" -- el primer segmento (antes de la primera
// coma) es la calle+numero, y la comuna ya la tenemos aparte en `city`.
export function formatShortAddress(address: string | null, city: string | null): string | null {
  const street = address?.split(",")[0]?.trim() || "";
  const parts = [street, city].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36);
}

// Lee un archivo como base64 sin el prefijo "data:...;base64,".
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

// Sube un archivo al bucket "finances" y devuelve su URL pública. Si falla
// la subida avisa con un toast y devuelve null (mismo mensaje de siempre).
export async function uploadFinancesFile(storagePath: string, file: File): Promise<string | null> {
  const uploadResult = await supabase.storage.from("finances").upload(storagePath, file, { upsert: false });
  if (uploadResult.error) {
    toast.error("Error subiendo el archivo: " + uploadResult.error.message);
    return null;
  }
  const { data } = supabase.storage.from("finances").getPublicUrl(storagePath);
  return data.publicUrl;
}
