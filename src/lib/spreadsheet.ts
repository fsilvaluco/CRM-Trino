import * as XLSX from "xlsx";

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

/** Lee un CSV o Excel (buffer) y devuelve filas como texto plano — la
 * conversión a número/fecha real pasa después, según el mapeo elegido por
 * el usuario (columna por columna, no se puede adivinar antes de eso). */
export function parseSpreadsheet(buffer: Buffer, filename: string): ParsedFile {
  const isCsv = filename.toLowerCase().endsWith(".csv");
  const workbook = isCsv
    ? XLSX.read(buffer.toString("utf-8"), { type: "string" })
    : XLSX.read(buffer, { type: "buffer" });

  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];

  // raw:false → todo como string ya formateado (evita que las fechas de
  // Excel salgan como números de serie); defval:"" → celdas vacías no
  // rompen el mapeo por columna faltante.
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false, defval: "" });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  return { headers, rows };
}

/** Convierte texto de planilla a número, tolerando formato chileno
 * (1.234,56) y anglosajón (1,234.56) mezclados con símbolos de moneda o
 * espacios. Devuelve null si no se puede interpretar — nunca inventa 0. */
export function parseFlexibleNumber(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;

  let cleaned = trimmed.replace(/[^0-9.,-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;

  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");

  if (hasDot && hasComma) {
    // El separador decimal es el que aparece último.
    const lastDot = cleaned.lastIndexOf(".");
    const lastComma = cleaned.lastIndexOf(",");
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Solo coma: decimal si quedan 1-2 dígitos después (ej. "8,8"), si no,
    // separador de miles (ej. "8,800").
    const parts = cleaned.split(",");
    if (parts[parts.length - 1].length <= 2) {
      cleaned = cleaned.replace(/,/g, (m, i) => (i === cleaned.lastIndexOf(",") ? "." : ""));
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasDot) {
    const parts = cleaned.split(".");
    // Múltiples puntos ("1.234.567") = separador de miles, no decimal.
    if (parts.length > 2) {
      cleaned = cleaned.replace(/\./g, "");
    } else if (parts[parts.length - 1].length === 3 && parts[0] !== "") {
      // Ambiguo (ej. "1.234") — tratamos 3 dígitos exactos tras el punto
      // como separador de miles (más común en planillas en español).
      cleaned = cleaned.replace(/\./g, "");
    }
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/** Convierte texto de planilla a fecha ISO (YYYY-MM-DD), tolerando
 * DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD y variantes con 2 dígitos de año.
 * Devuelve null si no se puede interpretar — nunca inventa una fecha. */
export function parseFlexibleDate(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;

  // YYYY-MM-DD o YYYY/MM/DD
  let match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DD-MM-YYYY o DD/MM/YYYY (formato chileno estándar)
  match = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (match) {
    const [, d, m, yRaw] = match;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Último recurso: dejar que el motor de fechas de JS lo intente (cubre
  // formatos tipo "22 jul 2026", "July 22, 2026", etc.)
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}
