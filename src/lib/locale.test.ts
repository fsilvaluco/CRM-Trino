// Pruebas del formateo de montos (centavos -> moneda). Runner: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoney, formatCurrencyWith, DEFAULT_LOCALE, COUNTRY_PRESETS } from "./locale";

// Intl usa espacios no separables entre simbolo y numero en algunos locales;
// se normalizan para comparar texto plano.
const norm = (s: string) => s.replace(/[  ]/g, " ");

test("formatMoney: sin opciones usa CLP sin decimales", () => {
  assert.equal(formatMoney(1234500), "$12.345");
});

test("formatMoney: CLP nunca muestra ',00'", () => {
  assert.equal(formatMoney(100), "$1");
  assert.equal(formatMoney(0), "$0");
  assert.ok(!formatMoney(99_999_900).includes(","));
});

test("formatMoney: CLP redondea las fracciones de peso", () => {
  assert.equal(formatMoney(1234550), "$12.346"); // 12.345,5 -> 12.346
  assert.equal(formatMoney(1234549), "$12.345"); // 12.345,49 -> 12.345
});

test("formatMoney: CLP con monto negativo conserva signo y sin decimales", () => {
  // es-CL pone el signo despues del simbolo ("$-12.345"); otros motores lo
  // ponen antes. Lo importante: signo presente y sin ",00".
  assert.match(norm(formatMoney(-1234500)), /^(-\s?\$|\$\s?-)12\.345$/);
});

test("formatMoney: USD en en-US muestra 2 decimales", () => {
  assert.equal(formatMoney(1234500, { currency: "USD", locale: "en-US" }), "$12,345.00");
  assert.equal(formatMoney(1234567, { currency: "USD", locale: "en-US" }), "$12,345.67");
});

test("formatMoney: MXN en es-MX muestra 2 decimales", () => {
  assert.equal(formatMoney(1234567, { currency: "MXN", locale: "es-MX" }), "$12,345.67");
});

test("formatMoney: solo moneda usa el locale por defecto (es-CL)", () => {
  assert.equal(norm(formatMoney(1234567, { currency: "USD" })), "US$12.345,67");
});

test("formatMoney: moneda invalida cae al respaldo con 2 decimales", () => {
  assert.equal(formatMoney(1234567, { currency: "NO-VALIDA" }), "NO-VALIDA 12345.67");
});

test("formatCurrencyWith: usa moneda y locale de la configuracion", () => {
  assert.equal(formatCurrencyWith(1234500, DEFAULT_LOCALE), "$12.345");
  assert.equal(formatCurrencyWith(1234500, COUNTRY_PRESETS.US), "$12,345.00");
  assert.equal(formatCurrencyWith(1234567, COUNTRY_PRESETS.MX), "$12,345.67");
});

test("formatCurrencyWith: equivale a formatMoney con las mismas opciones", () => {
  const s = COUNTRY_PRESETS.AR;
  assert.equal(
    formatCurrencyWith(987654, s),
    formatMoney(987654, { currency: s.currency, locale: s.currencyLocale })
  );
});
