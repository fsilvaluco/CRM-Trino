// ─── Montos de una liquidacion en su moneda ─────────────────────────────────
// Los montos se guardan enteros en la UNIDAD MINIMA de la moneda (migracion
// 109): pesos para CLP, que no tiene decimales, y centavos para USD. Asi
// USD 40,53 vive como 4053 y nunca se redondea un centavo. Este modulo es
// el unico lugar que sabe convertir entre lo que se escribe/muestra y lo
// que se guarda -- lo usan el formulario, las tarjetas, la pagina de firma
// y el PDF del comprobante. No importa nada server-only.

export type SettlementCurrency = "CLP" | "USD";

export const SETTLEMENT_CURRENCIES: SettlementCurrency[] = ["CLP", "USD"];

export function isSettlementCurrency(value: unknown): value is SettlementCurrency {
  return value === "CLP" || value === "USD";
}

/** Cuantos decimales tiene la unidad minima de cada moneda. */
function decimals(currency: SettlementCurrency): number {
  return currency === "USD" ? 2 : 0;
}

/** 4053 USD -> "US$40,53"; 1077427 CLP -> "$1.077.427". */
export function formatSettlementAmount(minor: number | null | undefined, currency: SettlementCurrency = "CLP"): string {
  if (minor == null) return "--";
  const d = decimals(currency);
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(minor / 10 ** d);
}

/** Lo que el usuario escribe -> unidad minima. Acepta "40,53", "40.53",
 * "1.077.427" (CLP con puntos de miles) y "$ 1.077.427". */
export function parseAmountInput(input: string, currency: SettlementCurrency): number {
  const raw = input.replace(/[^\d.,]/g, "");
  if (!raw) return 0;
  if (currency === "CLP") return parseInt(raw.replace(/\D/g, ""), 10) || 0;
  // USD: la ultima coma o punto es el separador decimal si le siguen 1 o 2
  // digitos; todo lo demas son separadores de miles.
  const match = raw.match(/^(.*?)[.,](\d{1,2})$/);
  const entero = (match ? match[1] : raw).replace(/\D/g, "") || "0";
  const frac = match ? match[2].padEnd(2, "0") : "00";
  return parseInt(entero, 10) * 100 + parseInt(frac, 10);
}

/** Unidad minima -> texto editable en el formulario ("40,53" / "1077427"). */
export function amountToInput(minor: number | null | undefined, currency: SettlementCurrency): string {
  if (!minor) return "";
  if (currency === "CLP") return String(minor);
  return (minor / 100).toFixed(2).replace(".", ",");
}
