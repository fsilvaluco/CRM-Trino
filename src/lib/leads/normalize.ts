import { createHash } from "crypto";

// Normaliza telefonos chilenos a E.164 (+569XXXXXXXX). Si no calza con un
// formato chileno conocido, devuelve los digitos con "+" (numero extranjero).
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 9 && digits.startsWith("9")) return `+56${digits}`;
  if (digits.length === 11 && digits.startsWith("569")) return `+${digits}`;
  if (digits.length === 8) return `+569${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = raw?.trim().toLowerCase();
  return v ? v : null;
}

// Meta exige SHA-256 en minuscula de los datos personales (sin el "+" en el telefono).
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
