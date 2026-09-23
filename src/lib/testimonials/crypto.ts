import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";

// Codigos y tokens del flujo de testimonios. En la base solo quedan hashes:
// el codigo va amarrado al id de la fila (sha256(codigo + id)) para que un
// mismo codigo no sirva en otro testimonio.

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Codigo de 6 digitos con CSPRNG (incluye ceros a la izquierda). */
export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashCode(code: string, id: string): string {
  return sha256Hex(`${code}${id}`);
}

/** Token aleatorio para los links de moderacion (base64url, 256 bits). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return sha256Hex(token);
}

/** Compara dos hashes hex en tiempo constante. */
export function safeEqualHex(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}
