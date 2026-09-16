// ─── Planilla de costos: CSV de ida y vuelta ────────────────────────────────
// Pedido de Francisco (16 sep 2026): poder bajar la planilla de un evento y
// subirla a otro, para no volver a tipear los mismos 20 costos de siempre.
//
// La regla que ordena todo este archivo: el CSV que se exporta es EXACTAMENTE
// el que se sabe importar. Si se agrega una columna hay que tocar las dos
// puntas (COST_CSV_COLUMNS y los alias de `columnKey`), si no la ida y vuelta
// deja de cerrar.
//
// Lo que NO viaja en el CSV y es a proposito:
//  - comprobantes (boleta/factura y comprobante de pago): son archivos, no
//    texto, y ademas son del evento viejo.
//  - "pagado": copiar el estado de pago de otro evento seria mentir en la
//    contabilidad del evento nuevo. Se exporta para poder leer la planilla en
//    Excel, pero al importar SIEMPRE entra como no pagado (ver el front).

import { COST_CATEGORIES, isCostCategory } from "@/lib/cost-categories";
import { liquidoToBruto, retencionFromBruto } from "@/lib/bhe";
import { parseFlexibleNumber } from "@/lib/spreadsheet";
import * as XLSX from "xlsx";
import type { CostItem } from "@/types/shows";

export const COST_CSV_COLUMNS = [
  "Detalle",
  "Categoría",
  "Responsable",
  "Monto",
  "Es BHE",
  "Líquido",
  "Pagado",
  "Notas",
  "Km",
  "Factor $/km",
] as const;

/** Un item tal como sale del CSV -- montos ya en centavos, listo para armar
 * un CostItem en el front (que es quien pone el id temporal y la posicion). */
export interface ParsedCostRow {
  label: string;
  category: string | null;
  responsable: string | null;
  /** Bruto, igual que `CostItem.amount` (en BHE, el bruto de la boleta). */
  amount: number;
  esBhe: boolean;
  liquidoAmount: number | null;
  notes: string | null;
  km: number | null;
  kmRate: number | null;
  /** Lo que se pudo leer pero con reparo -- se le muestra en la vista previa. */
  warnings: string[];
}

export interface ParsedCostSheet {
  items: ParsedCostRow[];
  /** Filas que no se pudieron usar, con el numero de fila del archivo. */
  skipped: { row: number; reason: string }[];
}

// ─── Exportar ───────────────────────────────────────────────────────────────

function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = String(value);
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function centsToPesos(cents: number | null | undefined): string {
  if (cents == null) return "";
  return String(Math.round(cents / 100));
}

/**
 * CSV de la planilla. Va con BOM y separado por punto y coma porque el Excel
 * en español (es-CL) abre asi los CSV sin pasar por el asistente de
 * importacion -- con coma, mete toda la fila en la columna A.
 */
export function buildCostSheetCsv(items: CostItem[]): string {
  const lines = [COST_CSV_COLUMNS.join(";")];

  for (const item of items) {
    lines.push(
      [
        csvCell(item.label),
        csvCell(item.category),
        csvCell(item.responsable),
        csvCell(centsToPesos(item.amount)),
        csvCell(item.esBhe ? "Sí" : "No"),
        csvCell(item.esBhe ? centsToPesos(item.liquidoAmount) : ""),
        csvCell(item.pagado ? "Sí" : "No"),
        csvCell(item.notes),
        csvCell(item.km ?? ""),
        csvCell(item.kmRate != null ? centsToPesos(item.kmRate) : ""),
      ].join(";")
    );
  }

  const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);
  lines.push(["TOTAL", "", "", centsToPesos(total), "", "", "", "", "", ""].join(";"));

  // BOM: sin el, Excel lee el archivo como Latin-1 y los acentos salen rotos.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** Nombre de archivo tipo "260916 - Costos Bar Loreto" -- mismo criterio que
 * el titulo que se le pone al print del cierre, para que ordenen por fecha. */
export function costSheetFilename(
  event: { name: string; date: string },
  extension: "csv" | "pdf"
): string {
  const datePrefix = /^\d{4}-\d{2}-\d{2}/.test(event.date)
    ? event.date.slice(2, 10).replace(/-/g, "")
    : "";
  const name = (event.name || "evento")
    .replace(/[\\/:*?"<>|]/g, "-") // prohibidos en Windows
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return `${datePrefix ? `${datePrefix} - ` : ""}Costos ${name}.${extension}`;
}

// ─── Importar ───────────────────────────────────────────────────────────────

/** minusculas, sin acentos y sin espacios de sobra -- para comparar encabezados
 * y categorias sin que un "Categoria" sin tilde rompa el import.
 *
 * El ﻿ del principio importa: el BOM que hace que Excel abra bien el
 * archivo queda pegado al PRIMER encabezado cuando se vuelve a leer
 * ("﻿Detalle"), asi que sin sacarlo la columna Detalle de nuestro propio
 * CSV no calzaba con ningun alias. */
function normalize(value: string): string {
  return value
    .replace(/﻿/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type ColumnKey =
  | "label"
  | "category"
  | "responsable"
  | "amount"
  | "esBhe"
  | "liquido"
  | "pagado"
  | "notes"
  | "km"
  | "kmRate";

// Alias aceptados por columna. Existen porque la planilla puede venir de un
// Excel escrito a mano por alguien del equipo, no solo de nuestra exportacion.
const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  label: ["detalle", "item", "descripcion", "glosa", "concepto", "gasto"],
  category: ["categoria", "tipo"],
  responsable: ["responsable", "proveedor", "a quien se le paga"],
  amount: ["monto", "total", "valor", "precio", "bruto", "monto bruto"],
  esBhe: ["es bhe", "bhe", "boleta de honorarios"],
  liquido: ["liquido", "monto liquido", "liquido a pagar"],
  pagado: ["pagado", "esta pagado"],
  notes: ["notas", "nota", "observaciones", "comentarios"],
  km: ["km", "kilometros", "kms"],
  kmRate: ["factor $/km", "factor km", "$/km", "valor km", "precio km"],
};

function columnKey(header: string): ColumnKey | null {
  const clean = normalize(header);
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(clean)) return key as ColumnKey;
  }
  return null;
}

function parseBool(raw: string | undefined): boolean {
  if (!raw) return false;
  return ["si", "sí", "s", "true", "1", "x", "yes", "verdadero"].includes(normalize(raw));
}

/** Calza el texto contra la lista cerrada de categorias. Devuelve null si no
 * calza con ninguna -- la categoria es un CHECK en la base, inventarla haria
 * fallar el guardado entero. */
function matchCategory(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const clean = normalize(raw);
  return COST_CATEGORIES.find((c) => normalize(c) === clean) ?? null;
}

function pesosToCents(raw: string | undefined): number | null {
  const pesos = parseFlexibleNumber(raw);
  if (pesos == null) return null;
  return Math.round(pesos) * 100;
}

/**
 * Lee el CSV a filas crudas. Es casi `parseSpreadsheet()` pero con
 * `blankrows: true` a proposito: si las filas vacias se descartan, el numero
 * de fila que se le informa a la persona ("Fila 7: sin detalle") deja de
 * calzar con lo que ve en Excel apenas el archivo tiene una linea en blanco
 * al medio, que es justo lo que pasa cuando alguien edita la planilla a mano.
 * Las filas vacias las filtra despues `parseCostSheetRows`, en silencio.
 */
export function readCostSheetCsv(buffer: Buffer): Record<string, string>[] {
  const workbook = XLSX.read(buffer.toString("utf-8"), { type: "string" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    raw: false,
    defval: "",
    blankrows: true,
  });
}

/**
 * Convierte las filas crudas de la planilla (ya leidas por `parseSpreadsheet`)
 * en items de costo. No escribe nada: esto alimenta la vista previa, y recien
 * cuando la persona confirma se agregan a la planilla y se guardan por el PUT
 * de siempre.
 */
export function parseCostSheetRows(rows: Record<string, string>[]): ParsedCostSheet {
  const items: ParsedCostRow[] = [];
  const skipped: { row: number; reason: string }[] = [];

  const headerMap = new Map<ColumnKey, string>();
  for (const header of Object.keys(rows[0] ?? {})) {
    const key = columnKey(header);
    // El primer encabezado que calza gana: si la planilla trae "Monto" y
    // "Monto bruto", se usa el de mas a la izquierda y no el ultimo.
    if (key && !headerMap.has(key)) headerMap.set(key, header);
  }

  const get = (row: Record<string, string>, key: ColumnKey): string | undefined => {
    const header = headerMap.get(key);
    return header ? row[header] : undefined;
  };

  rows.forEach((row, index) => {
    // +2: la fila 1 del archivo son los encabezados y las planillas se cuentan
    // desde 1, asi que el numero que se muestra calza con lo que ve en Excel.
    const rowNumber = index + 2;

    const label = (get(row, "label") ?? "").trim();
    const amountRaw = get(row, "amount");
    const amount = pesosToCents(amountRaw);

    const isEmpty = !label && amount == null && !(get(row, "responsable") ?? "").trim();
    if (isEmpty) return; // fila en blanco al final del archivo, ni se menciona

    // La fila de totales que agrega nuestra propia exportacion (y la que
    // suele escribir a mano quien arma la planilla en Excel).
    if (!get(row, "category")?.trim() && /^(total|totales|suma)\b/.test(normalize(label))) {
      skipped.push({ row: rowNumber, reason: "Fila de total, no es un costo" });
      return;
    }

    if (!label) {
      skipped.push({ row: rowNumber, reason: "Sin detalle" });
      return;
    }

    const warnings: string[] = [];

    const categoryRaw = get(row, "category");
    const category = matchCategory(categoryRaw);
    if (categoryRaw?.trim() && !category) {
      warnings.push(`Categoría "${categoryRaw.trim()}" no existe, queda sin categoría`);
    }

    if (amount == null && amountRaw?.trim()) {
      warnings.push(`No se entendió el monto "${amountRaw.trim()}", queda en $0`);
    }

    const esBhe = parseBool(get(row, "esBhe"));
    const liquidoRaw = get(row, "liquido");
    let liquidoAmount = pesosToCents(liquidoRaw);
    let finalAmount = amount ?? 0;

    if (esBhe) {
      if (liquidoAmount != null) {
        // El liquido manda: el bruto se recalcula con la retencion vigente,
        // que puede haber cambiado desde el evento que se esta copiando.
        finalAmount = liquidoToBruto(liquidoAmount);
      } else if (finalAmount > 0) {
        liquidoAmount = finalAmount - retencionFromBruto(finalAmount);
        warnings.push("BHE sin líquido: se calculó desde el bruto");
      } else {
        liquidoAmount = 0;
      }
    } else {
      liquidoAmount = null;
    }

    const kmValue = parseFlexibleNumber(get(row, "km"));

    items.push({
      label,
      category,
      responsable: (get(row, "responsable") ?? "").trim() || null,
      amount: finalAmount,
      esBhe,
      liquidoAmount,
      notes: (get(row, "notes") ?? "").trim() || null,
      km: kmValue != null ? Math.round(kmValue) : null,
      kmRate: pesosToCents(get(row, "kmRate")),
      warnings,
    });
  });

  return { items, skipped };
}

/** Los items de un evento, listos para copiarlos a otro. Es la misma forma que
 * devuelve el CSV, para que la vista previa no tenga que distinguir de donde
 * salieron. */
export function costItemsToParsedRows(items: CostItem[]): ParsedCostRow[] {
  return items.map((item) => ({
    label: item.label,
    category: isCostCategory(item.category) ? item.category : null,
    responsable: item.responsable,
    amount: item.amount ?? 0,
    esBhe: item.esBhe ?? false,
    liquidoAmount: item.esBhe ? item.liquidoAmount : null,
    notes: item.notes,
    km: item.km,
    kmRate: item.kmRate,
    warnings: [],
  }));
}
