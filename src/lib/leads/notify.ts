import { sendEmail } from "@/lib/resend";
import { esc, sendTelegram } from "@/lib/meta-ads/telegram";
import type { LeadFormConfig } from "./forms";
import type { IngestResult } from "./ingest";
import type { LeadIngestInput } from "./schema";
import { formatLeadNotes } from "./notes";

// Aviso de cada lead nuevo (o repetido) por email y Telegram. Se llama desde
// after() en /api/leads/ingest y /api/leads/quick: nunca bloquea la respuesta
// y cada canal falla por separado sin romper nada. Solo aplica a formularios
// con `notify` configurado en src/lib/leads/forms.ts.

export interface LeadNotifyParams {
  formKey: string;
  form: LeadFormConfig;
  input: LeadIngestInput;
  result: IngestResult;
}

function crmUrl(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://artistpro.app").replace(/\/+$/, "");
  return `${base}/crm`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function shouldNotifyLead(form: LeadFormConfig, result: IngestResult): boolean {
  return Boolean(form.notify?.to.length) && (result.status === "created" || result.status === "existing_deal");
}

export function buildLeadNotifySubject(input: LeadIngestInput, repeated: boolean): string {
  const when = input.event_date ?? "sin fecha";
  return repeated
    ? `🔁 Lead repetido SiSoy: ${input.name} (${when})`
    : `🎙️ Nuevo lead SiSoy: ${input.name} (${when})`;
}

export async function notifyNewLead({ formKey, form, input, result }: LeadNotifyParams): Promise<void> {
  if (!shouldNotifyLead(form, result) || !form.notify) return;
  const repeated = result.status === "existing_deal";
  const subject = buildLeadNotifySubject(input, repeated);
  const body = formatLeadNotes({
    formKey,
    form,
    input,
    phone: result.phone,
    email: result.email,
    kind: repeated ? "resubmit" : "new",
  });
  const url = crmUrl();

  const html = [
    `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">`,
    `<p><strong>${escapeHtml(subject)}</strong></p>`,
    `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>`,
    `<p><a href="${escapeHtml(url)}">Ver en el CRM</a></p>`,
    `</div>`,
  ].join("");

  const telegram = [`<b>${esc(subject)}</b>`, "", esc(body), "", `<a href="${esc(url)}">Ver en el CRM</a>`].join("\n");
  const chatId = process.env.SISOY_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "";

  const results = await Promise.allSettled([
    sendEmail({ to: form.notify.to, cc: form.notify.cc, subject, html }),
    sendTelegram(telegram, chatId),
  ]);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("[leads/notify]", r.reason instanceof Error ? r.reason.message : r.reason);
    }
  }
}
