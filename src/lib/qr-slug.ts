// Alfabeto sin caracteres ambiguos (0/O, 1/l/I) -- por si alguna vez alguien
// tiene que transcribirlo a mano en vez de escanear.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ";

export function generateQrSlug(length = 7): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}
