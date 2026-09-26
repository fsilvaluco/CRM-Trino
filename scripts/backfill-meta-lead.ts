#!/usr/bin/env tsx
/**
 * Reprocesa un lead de Meta Lead Ads ya ingresado para rellenar TODAS las
 * respuestas del formulario instantaneo en su trato:
 *   - deals.lead_meta.answers = [{ key, label, value, mapped }]
 *   - deals.notes: agrega "Pregunta: respuesta" (solo las no mapeadas y que
 *     no esten ya en las notas) justo despues de la linea "Origen: Meta Lead Ads".
 * No crea tratos, no toca contactos y NO reenvia Telegram ni email.
 *
 * Uso (desde la raiz del repo, con .env.local con NEXT_PUBLIC_SUPABASE_URL y
 * SUPABASE_SERVICE_ROLE_KEY):
 *   npx tsx scripts/backfill-meta-lead.ts <leadgen_id> [--dry-run]
 *
 * El token de Graph se toma de la integracion meta_leadgen del proyecto del
 * trato (igual que el webhook). Para forzar otro: META_LEADGEN_TOKEN=... .
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";
import {
  fetchGraphLeadForPage,
  fetchLeadFormLabels,
  listMetaLeadgenIntegrations,
  mapGraphLead,
} from "../src/lib/leads/meta-leadgen";
import { META_LEAD_ADS_LABEL, formatAnswerLines } from "../src/lib/leads/notes";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const leadgenId = args.find((a) => !a.startsWith("--"));
  if (!leadgenId || !/^\d+$/.test(leadgenId)) {
    console.error("Uso: npx tsx scripts/backfill-meta-lead.ts <leadgen_id> [--dry-run]");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: deals, error } = await db
    .from("deals")
    .select("id, project_id, notes, lead_meta")
    .contains("lead_meta", { leadgen_ids: [leadgenId] })
    .limit(2);
  if (error) throw new Error(`No se pudo buscar el trato: ${error.message}`);
  if (!deals?.length) throw new Error(`No hay trato con lead_meta.leadgen_ids que incluya ${leadgenId}`);
  if (deals.length > 1) console.warn(`Hay mas de un trato con ese leadgen_id; se usa ${deals[0].id}`);
  const deal = deals[0];
  const meta = (deal.lead_meta ?? {}) as Record<string, unknown>;
  const metaAds = (meta.meta_lead_ads ?? {}) as Record<string, unknown>;

  const integration = (await listMetaLeadgenIntegrations(db)).find((i) => i.projectId === deal.project_id);
  const token = process.env.META_LEADGEN_TOKEN || integration?.pageAccessToken;
  if (!token) throw new Error(`Sin token: el proyecto ${deal.project_id} no tiene integracion meta_leadgen con token`);
  const pageId = integration?.pageId ?? (typeof metaAds.page_id === "string" ? metaAds.page_id : null);

  const lead = await fetchGraphLeadForPage(leadgenId, pageId, token);
  const formId = lead.form_id ?? (typeof metaAds.form_id === "string" ? metaAds.form_id : null);
  const labels = await fetchLeadFormLabels(formId, pageId, token);
  const { answers } = mapGraphLead(String(meta.form ?? "meta"), lead, {
    leadgenId,
    pageId,
    formId,
    adId: lead.ad_id ?? null,
    adgroupId: null,
    createdTime: null,
  }, labels);

  // Lineas nuevas para las notas: solo las que no esten ya escritas.
  const notes = (deal.notes as string | null) ?? "";
  const missing = formatAnswerLines(answers).filter((l) => !notes.includes(l));
  let newNotes = notes;
  if (missing.length) {
    const lines = notes.split("\n");
    let idx = lines.findIndex((l) => l.startsWith(`Origen: ${META_LEAD_ADS_LABEL}`));
    if (idx >= 0) {
      while (idx + 1 < lines.length && lines[idx + 1].startsWith("Mensaje: ")) idx++;
      lines.splice(idx + 1, 0, ...missing);
      newNotes = lines.join("\n");
    } else {
      newNotes = `${notes.trimEnd()}${notes.trim() ? "\n\n" : ""}📥 Respuestas del formulario (Meta Lead Ads)\n${missing.join("\n")}`;
    }
  }

  console.log(`Trato ${deal.id} · formulario ${formId ?? "?"} · ${answers.length} respuestas`);
  for (const a of answers) console.log(`  ${a.mapped ? "[mapeada]" : "[extra]  "} ${a.label}: ${a.value}`);
  console.log(missing.length ? `Lineas nuevas en notas:\n  ${missing.join("\n  ")}` : "Las notas ya tienen todas las respuestas.");

  if (dryRun) {
    console.log("--dry-run: no se guardo nada.");
    return;
  }
  const { error: upErr } = await db
    .from("deals")
    .update({ notes: newNotes, lead_meta: { ...meta, answers } })
    .eq("id", deal.id);
  if (upErr) throw new Error(`No se pudo actualizar el trato: ${upErr.message}`);
  console.log("Listo: notas y lead_meta.answers actualizados (sin avisos).");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
