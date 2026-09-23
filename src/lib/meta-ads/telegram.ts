// Notificaciones por Telegram. Si TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID no
// están seteadas, es un no-op silencioso (el bot funciona igual, solo no avisa)
// -- así el código se despliega antes de que exista el bot de Telegram.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

export function telegramConfigured(): boolean {
  return Boolean(TOKEN && CHAT_ID);
}

/** Escapa texto dinámico antes de meterlo en un mensaje con parse_mode=HTML.
 *  Los `reason` del bot traen `<` y `>` (ej. "hook < 20%") que rompen el
 *  parseo de Telegram (error 400). Escapar & < > lo evita. */
export function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** chatId opcional: otro chat con el mismo bot (ej. SISOY_TELEGRAM_CHAT_ID). */
export async function sendTelegram(text: string, chatId: string = CHAT_ID): Promise<void> {
  if (!TOKEN || !chatId) {
    console.log("[meta-ads-bot] Telegram no configurado, mensaje omitido:", text.slice(0, 120));
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error("[meta-ads-bot] Telegram sendMessage falló:", res.status);
    }
  } catch (err) {
    console.error("[meta-ads-bot] Telegram error:", err instanceof Error ? err.message : err);
  }
}
