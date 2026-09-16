// ─── Cifrado del token de los links de firma externa ────────────────────────
//
// De la migración 099 en adelante, en la base vivía SOLO el SHA-256 del
// token: perfecto para validar un link, imposible para volver a mostrarlo.
// Eso obligaba a emitir uno nuevo (matando el anterior) cada vez que había
// que reenviárselo al cliente, y dejaba sin botón "Copiar link" a la ficha
// del evento -- pedido de Francisco (16 sep 2026).
//
// Punto medio: además del hash se guarda el token CIFRADO con AES-256-GCM.
// La llave vive en LINK_TOKEN_SECRET (variable de entorno de Railway), NO
// en la base -- quien se robe un dump de la base se lleva ciphertext
// inservible. El hash sigue siendo lo que valida cada request; esto es solo
// para poder mostrarle el link de vuelta a quien ya tiene permiso de
// administrar el cierre.
//
// Sin la variable configurada no se cifra nada y el botón de copiar
// simplemente no aparece -- el resto del flujo funciona igual que siempre.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const SECRET = process.env.LINK_TOKEN_SECRET;
const ALGO = "aes-256-gcm";
const VERSION = "v1";

export function isLinkTokenCryptoEnabled(): boolean {
  return Boolean(SECRET && SECRET.length >= 16);
}

/** La llave de 32 bytes sale de hashear el secreto -- así sirve cualquier
 * string largo, sin exigir un formato puntual en la variable de entorno. */
function key(): Buffer {
  return createHash("sha256").update(SECRET!).digest();
}

/**
 * Devuelve `v1.<iv>.<tag>.<ciphertext>` en base64url, o null si no hay
 * secreto configurado (ahí el link simplemente no se va a poder copiar
 * después, que es el comportamiento que había antes).
 */
export function encryptLinkToken(token: string): string | null {
  if (!isLinkTokenCryptoEnabled()) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

/**
 * null si no hay secreto, si el formato no calza, o si el GCM no valida
 * (típicamente porque se cambió LINK_TOKEN_SECRET después de emitir el
 * link). Nunca tira -- quien llama muestra "no se pudo recuperar, emite uno
 * nuevo", que es exactamente lo que corresponde hacer en ese caso.
 */
export function decryptLinkToken(encrypted: string | null | undefined): string | null {
  if (!encrypted || !isLinkTokenCryptoEnabled()) return null;
  const parts = encrypted.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const [, ivB64, tagB64, ctB64] = parts;
    const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
