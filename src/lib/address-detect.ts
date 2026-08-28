// Detección liviana de direcciones dentro de texto libre -- pensado para
// campos tipo "Notas / detalles" (ej. Timing/Cronograma de Eventos) donde
// la gente anota cosas como "Irrarazaval 1989" o "Metro Baquedano" al
// vuelo, sin un campo de dirección dedicado (ver ROLES.md/BITACORA.md,
// pedido de Francisco 27 ago 2026: se cansó de tener que abrir Maps en
// otra pestaña para revisar cada dirección a mano).
//
// No es un parser de direcciones real (eso requeriría un servicio de
// geocoding) -- es una heurística: "una o más palabras seguidas de un
// número" (con opcional letra pegada, ej. "1989-B") suele ser una calle +
// numeración. Puede haber falsos positivos (ej. "Piso 3") -- el costo de
// un falso positivo acá es bajo (un ícono de mapa de más que igual sirve
// para buscar el texto en Maps), así que se prefiere ser permisivo.

// Mínimo 3 dígitos en la numeración -- filtra falsos positivos comunes en
// este mismo campo ("Llegar 15 min antes", "Piso 3") sin perder
// direcciones reales (la numeración de calle en Chile casi siempre tiene
// 3+ dígitos: "1989", "520", "12500").
const ADDRESS_PATTERN =
  /\b(?:[A-ZÁÉÍÓÚÑ][\p{L}.'-]*\s+){1,4}\d{3,5}[a-zA-Z]?\b/u;

/**
 * Devuelve el fragmento de `text` que parece una dirección (calle + número),
 * o `null` si no encuentra nada que matchee el patrón. El fragmento
 * devuelto es el que conviene mandar como query a Google Maps -- no
 * necesariamente el texto completo del campo.
 */
export function extractAddressCandidate(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(ADDRESS_PATTERN);
  return match ? match[0].trim() : null;
}

/** URL de búsqueda de Google Maps para un texto de dirección/lugar. */
export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
