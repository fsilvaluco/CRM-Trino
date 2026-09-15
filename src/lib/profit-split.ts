// Nombres de las dos partes del reparto de utilidad de un evento.
//
// Hasta la migración 100 estaban quemados: un lado era el nombre del
// proyecto y el otro literalmente "Sello". Eso sirve para un evento de la
// cartera, pero no para uno EXTERNO -- producción que se le hace a un
// cliente que no es proyecto (ver migración 099, firma externa): ahí el
// reparto es entre ese cliente y Trino, y la planilla, el correo del
// cierre y el comprobante de firma tienen que decir eso.
//
// Sin etiqueta guardada se cae al comportamiento de siempre, así que los
// eventos que ya existían se ven exactamente igual que antes.

export const DEFAULT_TRINO_LABEL = "Sello";
export const DEFAULT_PROJECT_LABEL = "Proyecto";

export function profitSplitLabels(event: {
  profitSplitProjectLabel?: string | null;
  profitSplitTrinoLabel?: string | null;
  projectName?: string | null;
}): { project: string; trino: string } {
  return {
    project: event.profitSplitProjectLabel?.trim() || event.projectName || DEFAULT_PROJECT_LABEL,
    trino: event.profitSplitTrinoLabel?.trim() || DEFAULT_TRINO_LABEL,
  };
}
