import type { SupabaseClient } from "@supabase/supabase-js";

// Alfabeto sin caracteres ambiguos (0/O, 1/l/I) -- por si alguna vez alguien
// tiene que transcribirlo a mano en vez de escanear/tocar el link.
const RANDOM_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ";

export function generateRandomSlug(length = 7): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += RANDOM_ALPHABET[Math.floor(Math.random() * RANDOM_ALPHABET.length)];
  }
  return out;
}

// QR y Smartlinks comparten el mismo "namespace" de slugs -- ambos se
// pueden resolver desde la raiz del dominio corto (artspr.cl/{slug}), asi
// que un slug usado por un QR no puede repetirse en un Smartlink ni
// viceversa. Se valida contra las dos tablas siempre.
export async function isSlugTaken(supabase: SupabaseClient, slug: string): Promise<boolean> {
  const [qr, smartlink] = await Promise.all([
    supabase.from("qr_codes").select("id").eq("slug", slug).maybeSingle(),
    supabase.from("smartlinks").select("id").eq("slug", slug).maybeSingle(),
  ]);
  return Boolean(qr.data || smartlink.data);
}

// Normaliza lo que la persona escribe a mano a un slug valido para URL:
// minusculas, espacios/acentos fuera, solo [a-z0-9-]. Null si queda vacio
// o muy corto despues de limpiar.
export function normalizeCustomSlug(input: string): string | null {
  const cleaned = input
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // saca tildes (marcas combinantes tras NFD)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (cleaned.length < 3 || cleaned.length > 40) return null;
  return cleaned;
}

// Genera un slug random que todavia no exista, reintentando unas pocas
// veces (colisionar con 7 caracteres del alfabeto es muy poco probable,
// pero no imposible).
export async function generateAvailableSlug(supabase: SupabaseClient): Promise<string> {
  let slug = generateRandomSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!(await isSlugTaken(supabase, slug))) return slug;
    slug = generateRandomSlug();
  }
  return slug;
}
