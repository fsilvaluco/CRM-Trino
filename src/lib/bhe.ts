// Retención de Boleta de Honorarios Electrónica (BHE) en Chile. Sube
// gradualmente por ley (Ley 21.133): 14,5% en 2025, 15,25% en 2026, hasta
// llegar a 17% en 2028. Actualizar este número cuando cambie el año.
export const BHE_RETENTION_RATE = 0.1525;

/** Dado el monto líquido (lo que la persona recibe en mano), calcula el bruto de la boleta. */
export function liquidoToBruto(liquidoCents: number): number {
  return Math.round(liquidoCents / (1 - BHE_RETENTION_RATE));
}

/** La retención (lo que se entera al SII) para un bruto dado. */
export function retencionFromBruto(brutoCents: number): number {
  return Math.round(brutoCents * BHE_RETENTION_RATE);
}
