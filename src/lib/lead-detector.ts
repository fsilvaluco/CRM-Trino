import { createAdminClient } from "@/lib/supabase-admin";
import { refreshGoogleAccessToken, listRecentMessages, type GmailMessageSummary } from "@/lib/gmail";
import { detectLeadsInEmail } from "@/lib/claude";

type AdminClient = ReturnType<typeof createAdminClient>;

interface GmailConnectionRow {
  id: string;
  organization_id: string;
  project_id: string;
  email_address: string;
  refresh_token: string;
  access_token: string;
  token_expires_at: string | null;
  last_sync_at: string | null;
  status: string;
}

interface AliasRuleRow {
  pattern: string;
  target_project_id: string;
}

export interface DetectorRunResult {
  connectionId: string;
  emailAddress: string;
  messagesScanned: number;
  leadsCreated: number;
  error?: string;
}

// Si nunca se ha sincronizado esta cuenta, revisa los ultimos 2 dias en vez
// de todo el historial (evitar un alud de correos viejos en la primera pasada).
const DEFAULT_LOOKBACK_SECONDS = 2 * 24 * 60 * 60;

function matchesAliasRule(recipients: string[], rule: AliasRuleRow): boolean {
  const pattern = rule.pattern.toLowerCase();
  return recipients.some((r) => {
    const addr = r.toLowerCase();
    if (pattern.startsWith("@")) return addr.endsWith(pattern);
    return addr === pattern;
  });
}

/**
 * Determina a que proyecto se debe anclar un correo: por defecto el
 * proyecto de la conexion (el sello cuya bandeja se esta leyendo), a
 * menos que el destinatario real coincida con una regla de alias -- en
 * ese caso, el correo pertenece a la OTRA empresa aunque llego a esta
 * bandeja fisica.
 */
function resolveTargetProjectId(
  message: GmailMessageSummary,
  connectionProjectId: string,
  aliasRules: AliasRuleRow[]
): string {
  const recipients = [...message.to, ...message.cc];
  const match = aliasRules.find((rule) => matchesAliasRule(recipients, rule));
  return match?.target_project_id ?? connectionProjectId;
}

async function getValidAccessToken(
  supabase: AdminClient,
  connection: GmailConnectionRow
): Promise<string> {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
  const stillValid = expiresAt && expiresAt.getTime() - Date.now() > 60_000;
  if (stillValid) return connection.access_token;

  const refreshed = await refreshGoogleAccessToken(connection.refresh_token);
  await supabase
    .from("gmail_connections")
    .update({ access_token: refreshed.accessToken, token_expires_at: refreshed.expiresAt })
    .eq("id", connection.id);

  return refreshed.accessToken;
}

export async function runLeadDetectionForConnection(
  connectionId: string
): Promise<DetectorRunResult> {
  const supabase = createAdminClient();

  const { data: connection, error: connErr } = await supabase
    .from("gmail_connections")
    .select("*")
    .eq("id", connectionId)
    .single();

  if (connErr || !connection) {
    return { connectionId, emailAddress: "?", messagesScanned: 0, leadsCreated: 0, error: "Conexion no encontrada" };
  }

  const conn = connection as GmailConnectionRow;

  try {
    const accessToken = await getValidAccessToken(supabase, conn);

    const sinceEpoch = conn.last_sync_at
      ? Math.floor(new Date(conn.last_sync_at).getTime() / 1000)
      : Math.floor(Date.now() / 1000) - DEFAULT_LOOKBACK_SECONDS;

    const messages = await listRecentMessages(accessToken, sinceEpoch);

    const { data: aliasRulesData } = await supabase
      .from("email_alias_rules")
      .select("pattern, target_project_id")
      .eq("organization_id", conn.organization_id);
    const aliasRules = (aliasRulesData ?? []) as AliasRuleRow[];

    // Cache de proyectos-hijo por proyecto destino, para no repetir la
    // consulta si varios correos caen en el mismo proyecto.
    const childrenCache = new Map<string, Array<{ id: string; name: string }>>();
    const projectNameCache = new Map<string, string>();

    async function getProjectContext(projectId: string) {
      if (!childrenCache.has(projectId)) {
        const { data: children } = await supabase
          .from("projects")
          .select("id, name")
          .eq("parent_project_id", projectId);
        childrenCache.set(projectId, children ?? []);
      }
      if (!projectNameCache.has(projectId)) {
        const { data: proj } = await supabase
          .from("projects")
          .select("name")
          .eq("id", projectId)
          .single();
        projectNameCache.set(projectId, proj?.name ?? "la empresa");
      }
      return {
        name: projectNameCache.get(projectId)!,
        children: childrenCache.get(projectId)!,
      };
    }

    let leadsCreated = 0;

    for (const message of messages) {
      const targetProjectId = resolveTargetProjectId(message, conn.project_id, aliasRules);
      const { name: selloName, children: artistProjects } = await getProjectContext(targetProjectId);

      const detected = await detectLeadsInEmail({
        fromAddress: message.from,
        subject: message.subject,
        snippet: message.snippet,
        selloName,
        artistProjects,
      });

      for (const lead of detected) {
        const { error: insertErr } = await supabase
          .from("lead_candidates")
          .upsert(
            {
              organization_id: conn.organization_id,
              project_id: targetProjectId,
              artist_project_id: lead.artistProjectId,
              source: "email",
              raw_excerpt: message.snippet,
              signal_reason: lead.signalReason,
              thread_reference: message.id,
              detected_name: lead.detectedName,
              detected_email: lead.detectedEmail ?? message.from.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null,
              detected_phone: lead.detectedPhone,
              detected_company: lead.detectedCompany,
              status: "pending_review",
            },
            { onConflict: "organization_id,source,thread_reference", ignoreDuplicates: true }
          );

        if (!insertErr) leadsCreated += 1;
      }
    }

    await supabase
      .from("gmail_connections")
      .update({ last_sync_at: new Date().toISOString(), status: "active" })
      .eq("id", conn.id);

    return {
      connectionId: conn.id,
      emailAddress: conn.email_address,
      messagesScanned: messages.length,
      leadsCreated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    await supabase.from("gmail_connections").update({ status: "error" }).eq("id", conn.id);
    return { connectionId: conn.id, emailAddress: conn.email_address, messagesScanned: 0, leadsCreated: 0, error: message };
  }
}

export async function runLeadDetectionForAllConnections(): Promise<DetectorRunResult[]> {
  const supabase = createAdminClient();
  const { data: connections } = await supabase
    .from("gmail_connections")
    .select("id")
    .eq("status", "active");

  const results: DetectorRunResult[] = [];
  for (const c of connections ?? []) {
    results.push(await runLeadDetectionForConnection(c.id));
  }
  return results;
}
