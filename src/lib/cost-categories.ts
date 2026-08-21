// Categorías fijas para ítems de costo (Planilla de Eventos) -- pensadas
// para poder sacar informes de "en qué se gasta" más adelante, por eso son
// una lista cerrada (no un catálogo que crece solo como los "Detalle").
//
// Si se agrega/saca una categoría acá, hay que actualizar el CHECK
// constraint de `category` en event_cost_items/event_cost_submissions
// (migración 071_cost_categories.sql) para que sigan calzando.
export const COST_CATEGORIES = [
  "Movilización",
  "Bencina",
  "Alimentación",
  "Alojamiento",
  "Arriendo de audio",
  "Arriendo de luces",
  "Arriendo de espacio",
  "Catering",
  "Producción y staff",
  "Seguridad",
  "Permisos y derechos de autor",
  "Marketing y difusión",
  "Otros",
] as const;

export type CostCategory = (typeof COST_CATEGORIES)[number];

export function isCostCategory(value: string | null | undefined): value is CostCategory {
  return !!value && (COST_CATEGORIES as readonly string[]).includes(value);
}
