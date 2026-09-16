// ─── PDF de la Planilla de costos ───────────────────────────────────────────
// El documento que se manda internamente para pedir aprobacion del gasto de un
// evento. NO es el acta de cierre (esa vive en external-signature.ts, tiene
// firmas, hash y valor legal): esto es el presupuesto/rendicion para que
// alguien lo mire y lo apruebe.
//
// Por eso muestra SOLO egresos -- ni fee, ni venta de entradas, ni utilidad.
// El PDF se manda por correo y termina reenviado a gente que no tiene por que
// ver los ingresos del evento (decision de Francisco, 16 sep 2026).

import { nuevoPdf } from "@/lib/pdf-writer";
import { formatCents } from "@/lib/external-signature";
import type { CostItem } from "@/types/shows";

export interface CostSheetPdfEvent {
  name: string;
  date: string;
  venue: string | null;
  city: string | null;
  projectName: string | null;
  closedAt: string | null;
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
  w.text("Detalle de egresos para aprobacion interna", { size: 10, gray: true });
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
    "Documento interno de egresos. No incluye ingresos ni utilidad del evento, y no reemplaza al acta de cierre de caja firmada.",
    8
  );
  w.paragraph("Generado por Artist Pro - artistpro.app", 8);

  return w.save();
}
