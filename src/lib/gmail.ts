const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailTokenRefreshResult {
  accessToken: string;
  expiresAt: string; // ISO
}

export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<GmailTokenRefreshResult> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`No se pudo renovar el token de Google: ${raw}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  internalDate: string;
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseAddressList(value: string): string[] {
  if (!value) return [];
  // Extrae direcciones de strings tipo "Nombre <correo@dominio.com>, otro@x.com"
  const matches = value.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g);
  return matches ?? [];
}

/**
 * Lista mensajes recientes de la bandeja (solo inbox, no enviados) desde
 * un timestamp dado, y trae metadata liviana (headers + snippet) -- NUNCA
 * el cuerpo completo del correo. Limita a maxResults para acotar costo.
 */
export async function listRecentMessages(
  accessToken: string,
  sinceEpochSeconds: number,
  maxResults = 20
): Promise<GmailMessageSummary[]> {
  const query = `in:inbox after:${sinceEpochSeconds}`;
  const listUrl = `${GMAIL_API_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listRes.ok) {
    const raw = await listRes.text();
    throw new Error(`Gmail list falló: ${raw}`);
  }

  const listData = (await listRes.json()) as { messages?: Array<{ id: string; threadId: string }> };
  const ids = listData.messages ?? [];

  const summaries: GmailMessageSummary[] = [];

  for (const { id } of ids) {
    const msgUrl = `${GMAIL_API_BASE}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject`;
    const msgRes = await fetch(msgUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!msgRes.ok) continue;

    const msg = (await msgRes.json()) as {
      id: string;
      threadId: string;
      snippet: string;
      internalDate: string;
      payload: { headers: Array<{ name: string; value: string }> };
    };

    const headers = msg.payload?.headers ?? [];
    summaries.push({
      id: msg.id,
      threadId: msg.threadId,
      snippet: msg.snippet ?? "",
      from: getHeader(headers, "From"),
      to: parseAddressList(getHeader(headers, "To")),
      cc: parseAddressList(getHeader(headers, "Cc")),
      subject: getHeader(headers, "Subject"),
      internalDate: msg.internalDate,
    });
  }

  return summaries;
}
