import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase-admin";

// (Forzando rebuild: Railway reusaba el bundle cacheado del mismo commit y
// no recogia las variables NEXT_PUBLIC_VAPID_* recien agregadas -- 12 ago 2026)

// ─── Envío de Web Push ────────────────────────────────────────────────────
// Server-only. Diseñado a propósito para que el "disparo" (quién se
// notifica y por qué) esté separado del "canal" (cómo se entrega). Hoy solo
// existe el canal 'web_push' (columna en push_subscriptions), pero si más
// adelante el CRM se empaqueta como app nativa (Capacitor: FCM en Android,
// APNs en iOS), se suma un canal nuevo ahí sin tocar los call sites de
// sendPushToUsers().

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

// Manda una notificación a todos los dispositivos suscritos de una lista de
// usuarios. Fire-and-forget por diseño: quien la llama no debe esperar ni
// fallar si el envío falla (ver uso en /api/tasks). Limpia solas las
// suscripciones vencidas (410 Gone / 404) que devuelve el navegador cuando
// el usuario desinstaló, cambió de navegador, etc.
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  if (uniqueIds.length === 0) return;
  if (!ensureConfigured()) {
    console.error("[push] VAPID no configurado -- saltando envio");
    return;
  }

  const supabase = createAdminClient();
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", uniqueIds);

  if (error) {
    console.error("[push] error leyendo suscripciones:", error.message);
    return;
  }
  if (!subs || subs.length === 0) return;

  const body = JSON.stringify(payload);
  const staleIds: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(sub.id as string);
        } else {
          console.error("[push] error enviando a", sub.endpoint, err);
        }
      }
    })
  );

  if (staleIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", staleIds);
  }
}
