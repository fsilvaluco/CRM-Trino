// ─── PDF de la Planilla de costos ───────────────────────────────────────────
// El documento que se manda internamente para pedir aprobacion del gasto de un
// evento. NO es el acta de cierre (esa vive en external-signature.ts, tiene
// firmas, hash y valor legal): esto es el presupuesto/rendicion para que
// alguien lo mire y lo apruebe.
//
// Muestra el resumen financiero completo -- fee, entradas, egresos y la
// utilidad calculada -- ademas del detalle de costos: quien aprueba un gasto
// necesita verlo contra lo que el evento entra (Francisco, 16 sep 2026; en la
// primera version iban solo egresos y se quedaba corto para decidir).
//
// La utilidad se calcula contra el TOTAL DE ESTA PLANILLA, no contra el campo
// "Egresos" del evento, para que el documento no se contradiga a si mismo. Si
// los dos numeros difieren se dice en una linea, porque esa diferencia es
// justo lo que quien aprueba tiene que saber.

import { nuevoPdf } from "@/lib/pdf-writer";
import { formatCents } from "@/lib/external-signature";
import { profitSplitLabels } from "@/lib/profit-split";
import type { CostItem } from "@/types/shows";

export interface CostSheetPdfEvent {
  name: string;
  date: string;
  venue: string | null;
  city: string | null;
  projectName: string | null;
  closedAt: string | null;
  fee: number | null;
  ticketIncome: number | null;
  /** El campo "Egresos" del evento, que no siempre es el total de la planilla
   * (se copia a mano con "Usar como Egresos del evento"). */
  expenses: number | null;
  /** Eventos viejos cuya plata vive en un Excel aparte: ahi fee/entradas/
   * egresos son 0 y cualquier utilidad calculada seria un numero falso. */
  financialsUntracked: boolean;
  /** Reparto de utilidad. Los pct en null = no configurado en este evento:
   * se usa el default 70/30, igual que la pantalla, y se dice que es el
   * default para que nadie apruebe un reparto que nadie eligio. */
  profitSplitProjectPct: number | null;
  profitSplitTrinoPct: number | null;
  profitSplitProjectLabel: string | null;
  profitSplitTrinoLabel: string | null;
  profitSplitNote: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "--";
  try {
    return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "America/Santiago",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Santiago",
    });
  } catch {
    return iso;
  }
}

// Detalle | Categoria | Responsable | Pagado | Monto -- fracciones del ancho.
// Monto se lleva 0.15 porque tiene que entrar un "$12.345.678" completo: si se
// corta, el documento que se manda a aprobar muestra un numero equivocado.
const COLUMNS = [0.38, 0.2, 0.2, 0.07, 0.15];
const ALIGN = ["left", "left", "left", "left", "right"] as const;

// La nota de la BHE va debajo del item y ocupa el ancho entero: en la columna
// "Categoria" no le entraba el monto y quedaba cortada.
const NOTE_COLUMNS = [0.85, 0.15];

export async function buildCostSheetPdf(
  event: CostSheetPdfEvent,
  items: CostItem[],
  opts: { generatedAt?: string; generatedBy?: string | null } = {}
): Promise<Uint8Array> {
  const w = await nuevoPdf();

  w.text("PLANILLA DE COSTOS", { size: 14, bold: true });
  w.text("Resumen financiero y detalle de costos para aprobacion interna", { size: 10, gray: true });
  w.rule();

  w.text(event.name, { size: 12, bold: true });
  w.text(
    [formatDate(event.date), event.venue, event.city].filter(Boolean).join(" - ") +
      (event.projectName ? ` (${event.projectName})` : ""),
    { size: 9, gray: true }
  );
  if (event.closedAt) {
    w.text(`Caja cerrada el ${formatDateTime(event.closedAt)}`, { size: 9, gray: true });
  }

  const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);

  w.heading("RESUMEN DEL EVENTO");
  if (event.financialsUntracked) {
    w.paragraph(
      "Este evento no lleva su parte financiera en la app, asi que no se muestran ingresos ni utilidad. El detalle de costos de mas abajo si es el de la planilla."
    );
  } else {
    const ingresos = (event.fee ?? 0) + (event.ticketIncome ?? 0);
    w.row("Fee / cache", formatCents(event.fee));
    w.row("Venta de entradas", formatCents(event.ticketIncome));
    w.row("Total ingresos", formatCents(ingresos), { bold: true });
    w.row("Total egresos (esta planilla)", formatCents(total));
    w.row("Utilidad", formatCents(ingresos - total), { bold: true });

    // El campo "Egresos" del evento se llena a mano y puede haber quedado
    // atras respecto de la planilla. Callarlo seria mandar a aprobar una
    // utilidad que no calza con la que se ve en la app.
    if (event.expenses != null && event.expenses !== total) {
      w.paragraph(
        `El evento tiene registrado ${formatCents(event.expenses)} en "Egresos", distinto del total de esta planilla. La utilidad de arriba usa el total de la planilla.`
      );
    }
  }

  // ── Reparto de utilidad ───────────────────────────────────────────────────
  // Mismos defaults y etiquetas que la Planilla en pantalla (70/30 y
  // profitSplitLabels), para que el PDF y la app no digan cosas distintas.
  const projectPct = event.profitSplitProjectPct ?? 70;
  const trinoPct = event.profitSplitTrinoPct ?? 30;
  const splitPorDefecto = event.profitSplitProjectPct == null && event.profitSplitTrinoPct == null;
  const labels = profitSplitLabels({
    profitSplitProjectLabel: event.profitSplitProjectLabel,
    profitSplitTrinoLabel: event.profitSplitTrinoLabel,
    projectName: event.projectName,
  });

  w.heading("REPARTO DE UTILIDAD");
  if (event.financialsUntracked) {
    // Sin utilidad no hay monto que repartir; los porcentajes igual sirven.
    w.row(`${projectPct}% ${labels.project}`, formatCents(null), { size: 9 });
    w.row(`${trinoPct}% ${labels.trino}`, formatCents(null), { size: 9 });
  } else {
    const utilidad = (event.fee ?? 0) + (event.ticketIncome ?? 0) - total;
    w.row(`${projectPct}% ${labels.project}`, formatCents(Math.round((utilidad * projectPct) / 100)), {
      size: 9,
    });
    w.row(`${trinoPct}% ${labels.trino}`, formatCents(Math.round((utilidad * trinoPct) / 100)), {
      size: 9,
    });
  }
  if (splitPorDefecto) {
    w.paragraph("Este evento no tiene un reparto configurado: se muestra el 70/30 por defecto.");
  } else if (projectPct + trinoPct !== 100) {
    // Los dos porcentajes se editan por separado en la app, asi que pueden no
    // sumar 100. Mejor decirlo que dejar que alguien apruebe el descuadre.
    w.paragraph(`Atencion: los porcentajes suman ${projectPct + trinoPct}%, no 100%.`);
  }
  if (event.profitSplitNote?.trim()) {
    w.paragraph(event.profitSplitNote.trim());
  }

  w.heading("DETALLE");
  if (items.length === 0) {
    w.paragraph("Este evento todavia no tiene costos cargados.");
  } else {
    w.cols(["Detalle", "Categoria", "Responsable", "Pagado", "Monto"], {
      widths: COLUMNS,
      align: ALIGN,
      size: 8,
      bold: true,
      gray: true,
    });
    for (const item of items) {
      w.cols(
        [
          item.label,
          item.category ?? "--",
          item.responsable ?? "--",
          item.pagado ? "Si" : "No",
          formatCents(item.amount),
        ],
        { widths: COLUMNS, align: ALIGN, size: 9 }
      );
      // La BHE se explica en su propia linea: el monto de arriba es el bruto
      // de la boleta, pero a la persona se le transfiere el liquido, y sin
      // esto la diferencia parece un error de la planilla.
      if (item.esBhe && item.liquidoAmount != null) {
        w.cols([`    BHE - liquido a pagar ${formatCents(item.liquidoAmount)}`, ""], {
          widths: NOTE_COLUMNS,
          size: 8,
          gray: true,
        });
      }
    }
    w.rule();
    w.row("TOTAL EGRESOS", formatCents(total), { bold: true, size: 11 });
  }

  // Subtotales por categoria: es lo primero que pregunta quien aprueba
  // ("cuanto es produccion, cuanto es movilizacion").
  const porCategoria = new Map<string, number>();
  for (const item of items) {
    const key = item.category ?? "Sin categoria";
    porCategoria.set(key, (porCategoria.get(key) ?? 0) + (item.amount || 0));
  }
  if (porCategoria.size > 1) {
    w.heading("RESUMEN POR CATEGORIA");
    for (const [category, subtotal] of [...porCategoria].sort((a, b) => b[1] - a[1])) {
      const pct = total > 0 ? ` (${Math.round((subtotal / total) * 100)}%)` : "";
      w.row(`${category}${pct}`, formatCents(subtotal), { size: 9 });
    }
  }

  const pagado = items.filter((i) => i.pagado).reduce((sum, i) => sum + (i.amount || 0), 0);
  if (items.length > 0) {
    w.heading("ESTADO DE PAGO");
    w.row("Pagado", formatCents(pagado), { size: 9 });
    w.row("Por pagar", formatCents(total - pagado), { size: 9, bold: true });
  }

  w.heading("APROBACION");
  w.space(24);
  w.cols(["Nombre: ______________________________", "", "Fecha: ______________"], {
    widths: [0.6, 0.05, 0.35],
    size: 9,
  });
  w.space(10);
  w.cols(["Firma: _______________________________", "", ""], { widths: [0.6, 0.05, 0.35], size: 9 });

  w.rule();
  w.row("Documento generado el", formatDateTime(opts.generatedAt ?? new Date().toISOString()), {
    size: 8,
  });
  if (opts.generatedBy) w.row("Generado por", opts.generatedBy, { size: 8 });
  w.paragraph(
    "Documento interno para aprobacion. No reemplaza al acta de cierre de caja firmada.",
    8
  );
  w.paragraph("Generado por Artist Pro - artistpro.app", 8);

  return w.save();
}
