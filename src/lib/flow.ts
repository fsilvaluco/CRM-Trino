import crypto from "crypto";

// Flow firma TODOS los parametros (menos "s", que es donde va la firma
// misma) ordenados alfabeticamente por nombre de parametro, concatenados
// como nombre+valor+nombre+valor, y firmados con HMAC-SHA256 usando el
// secretKey. Ver: https://developers.flow.cl/api
//
// Sandbox vs produccion se elige solo con la URL base -- las credenciales
// de sandbox son DISTINTAS a las de produccion (se obtienen por separado
// en sandbox.flow.cl vs www.flow.cl).
const FLOW_BASE_URL = process.env.FLOW_BASE_URL || "https://sandbox.flow.cl/api";

function getCredentials() {
  const apiKey = process.env.FLOW_API_KEY;
  const secretKey = process.env.FLOW_SECRET_KEY;
  if (!apiKey || !secretKey) {
    throw new Error("FLOW_API_KEY / FLOW_SECRET_KEY no configurados en el servidor");
  }
  return { apiKey, secretKey };
}

function sign(params: Record<string, string | number>, secretKey: string): string {
  const sortedKeys = Object.keys(params).sort();
  const toSign = sortedKeys.map((k) => `${k}${params[k]}`).join("");
  return crypto.createHmac("sha256", secretKey).update(toSign).digest("hex");
}

async function flowPost<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const { apiKey, secretKey } = getCredentials();
  const fullParams = { ...params, apiKey };
  const s = sign(fullParams, secretKey);
  const body = new URLSearchParams({ ...fullParams, s } as Record<string, string>);

  const res = await fetch(`${FLOW_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message ?? `Error de Flow (status ${res.status})`);
  }
  return data as T;
}

async function flowGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const { apiKey, secretKey } = getCredentials();
  const fullParams = { ...params, apiKey };
  const s = sign(fullParams, secretKey);
  const query = new URLSearchParams({ ...fullParams, s } as Record<string, string>);

  const res = await fetch(`${FLOW_BASE_URL}${path}?${query}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message ?? `Error de Flow (status ${res.status})`);
  }
  return data as T;
}

export interface FlowCreatePaymentResult {
  url: string;
  token: string;
  flowOrder: number;
}

/** Crea una orden de pago única (no recurrente) y devuelve la URL a la que
 * hay que redirigir al pagador. Este es el punto de partida mas simple --
 * cobros recurrentes (subscription/plans) son un paso aparte, una vez que
 * este flujo basico este probado en sandbox. */
export async function createFlowPayment(params: {
  commerceOrder: string;
  subject: string;
  amount: number; // CLP, sin decimales
  email: string;
  urlConfirmation: string;
  urlReturn: string;
}): Promise<FlowCreatePaymentResult> {
  return flowPost<FlowCreatePaymentResult>("/payment/create", {
    commerceOrder: params.commerceOrder,
    subject: params.subject,
    amount: params.amount,
    email: params.email,
    urlConfirmation: params.urlConfirmation,
    urlReturn: params.urlReturn,
    currency: "CLP",
  });
}

export interface FlowPaymentStatus {
  flowOrder: number;
  commerceOrder: string;
  status: number; // 1: pendiente, 2: pagada, 3: rechazada, 4: anulada
  amount: number;
  currency: string;
  payer: string;
  paymentData?: { media?: string; date?: string };
}

/** Consulta el estado real de un pago usando el token que Flow envia al
 * webhook de confirmacion -- SIEMPRE hay que confiar en esta consulta, no
 * en lo que venga en el POST del webhook (Flow solo manda el token ahi,
 * el estado real se pide aparte para evitar que alguien falsifique el
 * webhook). */
export async function getFlowPaymentStatus(token: string): Promise<FlowPaymentStatus> {
  return flowGet<FlowPaymentStatus>("/payment/getStatus", { token });
}

export const FLOW_PAYMENT_STATUS = {
  PENDING: 1,
  PAID: 2,
  REJECTED: 3,
  CANCELED: 4,
} as const;
