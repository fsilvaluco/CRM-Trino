/**
 * seed-supabase.ts
 *
 * Inserta datos de demo directamente en Supabase.
 * Ejecutar: npx tsx scripts/seed-supabase.ts
 *
 * Requiere en .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...   (service role — bypasa RLS)
 *   SUPABASE_ORG_ID=...             (el ID del org en tu Supabase)
 *   SUPABASE_USER_ID=...            (el ID del usuario owner)
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Cargar .env.local
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = process.env.SUPABASE_ORG_ID;
const USER_ID = process.env.SUPABASE_USER_ID;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ORG_ID || !USER_ID) {
  console.error(`
❌  Faltan variables de entorno en .env.local:

  NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJ...   (Panel > Settings > API > service_role)
  SUPABASE_ORG_ID=<UUID del org>     (SELECT id FROM organizations LIMIT 1)
  SUPABASE_USER_ID=<UUID del owner>  (SELECT id FROM auth.users LIMIT 1)
`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── helpers ────────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID();
}

function meta() {
  return { organization_id: ORG_ID!, created_by: USER_ID! };
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

function daysFromNow(n: number) {
  return new Date(Date.now() + n * 86400000).toISOString();
}

async function insert<T extends object>(table: string, rows: T[]) {
  const { error } = await supabase.from(table).insert(rows);
  if (error) {
    console.error(`  ❌ Error en ${table}: ${error.message}`);
    throw error;
  }
  console.log(`  ✓ ${rows.length} fila(s) en ${table}`);
}

// ─── 1. Pipeline stages ──────────────────────────────────────────────────────

async function seedPipelineStages() {
  // Ver si ya existen
  const { data: existing } = await supabase
    .from("pipeline_stages")
    .select("id, name")
    .eq("organization_id", ORG_ID!);

  if (existing && existing.length > 0) {
    console.log(`  ⏭  pipeline_stages ya tiene datos (${existing.length} etapas)`);
    return existing as Array<{ id: string; name: string }>;
  }

  const stages = [
    { id: uuid(), name: "Nuevo lead",   order: 1, color: "#64748b", is_won: false, is_lost: false, organization_id: ORG_ID! },
    { id: uuid(), name: "Contactado",   order: 2, color: "#3b82f6", is_won: false, is_lost: false, organization_id: ORG_ID! },
    { id: uuid(), name: "Propuesta",    order: 3, color: "#f59e0b", is_won: false, is_lost: false, organization_id: ORG_ID! },
    { id: uuid(), name: "Negociacion",  order: 4, color: "#8b5cf6", is_won: false, is_lost: false, organization_id: ORG_ID! },
    { id: uuid(), name: "Cerrado",      order: 5, color: "#10b981", is_won: true,  is_lost: false, organization_id: ORG_ID! },
    { id: uuid(), name: "Descartado",   order: 6, color: "#ef4444", is_won: false, is_lost: true,  organization_id: ORG_ID! },
  ];

  await insert("pipeline_stages", stages);
  return stages.map(({ id, name }) => ({ id, name }));
}

// ─── 2. Companies ────────────────────────────────────────────────────────────

async function seedCompanies() {
  const { count } = await supabase
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ORG_ID!);

  if ((count ?? 0) > 0) {
    console.log(`  ⏭  companies ya tiene datos`);
    const { data } = await supabase.from("companies").select("id, name").eq("organization_id", ORG_ID!);
    return data ?? [];
  }

  const companies = [
    {
      id: uuid(), name: "TechStartup MX", industry: "Tecnología",
      website: "https://techstartup.mx", email: "info@techstartup.mx",
      phone: "+52 55 1234 0000", created_at: daysAgo(15), updated_at: daysAgo(1), ...meta(),
    },
    {
      id: uuid(), name: "Inmobiliaria Rodriguez", industry: "Bienes Raíces",
      email: "contacto@inmobiliaria.com", phone: "+52 33 9876 0000",
      created_at: daysAgo(12), updated_at: daysAgo(3), ...meta(),
    },
    {
      id: uuid(), name: "Martinez Consultores", industry: "RRHH / Consultoría",
      email: "info@consultoria.mx", created_at: daysAgo(10), updated_at: daysAgo(2), ...meta(),
    },
    {
      id: uuid(), name: "Agencia Creativa", industry: "Marketing / Diseño",
      website: "https://agencia.mx", email: "hola@agencia.mx",
      created_at: daysAgo(5), updated_at: daysAgo(0), ...meta(),
    },
  ];

  await insert("companies", companies);
  return companies.map(({ id, name }) => ({ id, name }));
}

// ─── 3. Contacts ─────────────────────────────────────────────────────────────

async function seedContacts(companies: Array<{ id: string; name: string }>) {
  const { count } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ORG_ID!);

  if ((count ?? 0) > 0) {
    console.log(`  ⏭  contacts ya tiene datos`);
    const { data } = await supabase.from("contacts").select("id, name").eq("organization_id", ORG_ID!);
    return data ?? [];
  }

  const co = Object.fromEntries(companies.map((c) => [c.name, c.id]));

  const contacts = [
    {
      id: uuid(), name: "Maria Garcia", email: "maria@techstartup.mx",
      phone: "+52 55 1234 5678",
      company_id: co["TechStartup MX"],
      source: "website", temperature: "hot", score: 85,
      notes: "Interesada en plan empresarial. Tiene equipo de 15 personas.",
      created_at: daysAgo(5), updated_at: daysAgo(1), ...meta(),
    },
    {
      id: uuid(), name: "Carlos Rodriguez", email: "carlos@inmobiliaria.com",
      phone: "+52 33 9876 5432",
      company_id: co["Inmobiliaria Rodriguez"],
      source: "referido", temperature: "warm", score: 60,
      notes: "Referido por Juan. Busca automatizar seguimiento de clientes.",
      created_at: daysAgo(10), updated_at: daysAgo(3), ...meta(),
    },
    {
      id: uuid(), name: "Ana Martinez", email: "ana@consultoria.mx",
      phone: "+52 81 5555 1234",
      company_id: co["Martinez Consultores"],
      source: "redes_sociales", temperature: "warm", score: 55,
      notes: "Nos contactó por LinkedIn. Consultoría de RRHH.",
      created_at: daysAgo(7), updated_at: daysAgo(2), ...meta(),
    },
    {
      id: uuid(), name: "Roberto Sanchez", email: "roberto@tienda.com",
      phone: "+52 55 7777 8888",
      source: "formulario", temperature: "cold", score: 25,
      notes: "Llenó formulario web. E-commerce de ropa.",
      created_at: daysAgo(15), updated_at: daysAgo(15), ...meta(),
    },
    {
      id: uuid(), name: "Laura Hernandez", email: "laura@agencia.mx",
      phone: "+52 33 4444 5555",
      company_id: co["Agencia Creativa"],
      source: "evento", temperature: "hot", score: 90,
      notes: "Conocida en evento de networking. Muy interesada, pidió demo inmediata.",
      created_at: daysAgo(3), updated_at: daysAgo(0), ...meta(),
    },
  ];

  await insert("contacts", contacts);
  return contacts.map(({ id, name }) => ({ id, name }));
}

// ─── 4. Deals ────────────────────────────────────────────────────────────────

async function seedDeals(
  contacts: Array<{ id: string; name: string }>,
  stages: Array<{ id: string; name: string }>
) {
  const { count } = await supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ORG_ID!);

  if ((count ?? 0) > 0) {
    console.log(`  ⏭  deals ya tiene datos`);
    const { data } = await supabase.from("deals").select("id, title").eq("organization_id", ORG_ID!);
    return data ?? [];
  }

  const stageMap = Object.fromEntries(stages.map((s) => [s.name, s.id]));
  const contactMap = Object.fromEntries(contacts.map((c) => [c.name, c.id]));

  const deals = [
    {
      id: uuid(),
      title: "Plan Empresarial - TechStartup MX",
      value: 250000,
      stage_id: stageMap["Propuesta"] ?? stages[2]?.id,
      contact_id: contactMap["Maria Garcia"],
      expected_close: daysFromNow(15),
      probability: 70,
      notes: "Enviamos propuesta. Esperando respuesta del director.",
      created_at: daysAgo(4), updated_at: daysAgo(1), ...meta(),
    },
    {
      id: uuid(),
      title: "CRM Personalizado - Inmobiliaria",
      value: 180000,
      stage_id: stageMap["Contactado"] ?? stages[1]?.id,
      contact_id: contactMap["Carlos Rodriguez"],
      expected_close: daysFromNow(30),
      probability: 40,
      notes: "Primera llamada realizada. Agendamos demo para la próxima semana.",
      created_at: daysAgo(8), updated_at: daysAgo(3), ...meta(),
    },
    {
      id: uuid(),
      title: "Servicio Premium - Agencia Creativa",
      value: 450000,
      stage_id: stageMap["Negociacion"] ?? stages[3]?.id,
      contact_id: contactMap["Laura Hernandez"],
      expected_close: daysFromNow(7),
      probability: 85,
      notes: "Negociando precio. Muy probable que cierre esta semana.",
      created_at: daysAgo(2), updated_at: daysAgo(0), ...meta(),
    },
  ];

  await insert("deals", deals);
  return deals.map(({ id, title }) => ({ id, title }));
}

// ─── 5. Activities ───────────────────────────────────────────────────────────

async function seedActivities(
  contacts: Array<{ id: string; name: string }>,
  deals: Array<{ id: string; title: string }>
) {
  const { count } = await supabase
    .from("activities")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ORG_ID!);

  if ((count ?? 0) > 0) {
    console.log(`  ⏭  activities ya tiene datos`);
    return;
  }

  const cMap = Object.fromEntries(contacts.map((c) => [c.name, c.id]));
  const dMap = Object.fromEntries(deals.map((d) => [d.title, d.id]));

  const activities = [
    {
      id: uuid(), type: "email",
      description: "Envío de propuesta comercial con pricing y features del plan empresarial.",
      contact_id: cMap["Maria Garcia"],
      deal_id: dMap["Plan Empresarial - TechStartup MX"],
      scheduled_at: null, completed_at: daysAgo(2), created_at: daysAgo(2), ...meta(),
    },
    {
      id: uuid(), type: "call",
      description: "Llamada de introducción. Carlos mostró interés en automatizar su proceso.",
      contact_id: cMap["Carlos Rodriguez"],
      deal_id: dMap["CRM Personalizado - Inmobiliaria"],
      scheduled_at: null, completed_at: daysAgo(5), created_at: daysAgo(5), ...meta(),
    },
    {
      id: uuid(), type: "meeting",
      description: "Reunión presencial en evento de networking. Intercambiamos tarjetas.",
      contact_id: cMap["Laura Hernandez"],
      deal_id: dMap["Servicio Premium - Agencia Creativa"],
      scheduled_at: null, completed_at: daysAgo(3), created_at: daysAgo(3), ...meta(),
    },
    {
      id: uuid(), type: "follow_up",
      description: "Dar seguimiento a Maria sobre la propuesta enviada. ¿Tiene dudas?",
      contact_id: cMap["Maria Garcia"],
      deal_id: dMap["Plan Empresarial - TechStartup MX"],
      scheduled_at: daysFromNow(1), completed_at: null, created_at: daysAgo(0), ...meta(),
    },
    {
      id: uuid(), type: "follow_up",
      description: "Agendar demo con Carlos para mostrar el CRM personalizado.",
      contact_id: cMap["Carlos Rodriguez"],
      deal_id: dMap["CRM Personalizado - Inmobiliaria"],
      scheduled_at: daysFromNow(3), completed_at: null, created_at: daysAgo(0), ...meta(),
    },
    {
      id: uuid(), type: "note",
      description: "Roberto no está listo para comprar. Agregar a newsletter y dar seguimiento en 30 días.",
      contact_id: cMap["Roberto Sanchez"],
      deal_id: null, scheduled_at: null, completed_at: null, created_at: daysAgo(14), ...meta(),
    },
    {
      id: uuid(), type: "call",
      description: "Negociación exitosa. Laura acepta el paquete premium con descuento del 10%.",
      contact_id: cMap["Laura Hernandez"],
      deal_id: dMap["Servicio Premium - Agencia Creativa"],
      scheduled_at: null, completed_at: daysAgo(1), created_at: daysAgo(1), ...meta(),
    },
    {
      id: uuid(), type: "follow_up",
      description: "Enviar contrato firmado a Laura y coordinar inicio del proyecto.",
      contact_id: cMap["Laura Hernandez"],
      deal_id: dMap["Servicio Premium - Agencia Creativa"],
      scheduled_at: daysFromNow(2), completed_at: null, created_at: daysAgo(0), ...meta(),
    },
  ];

  await insert("activities", activities);
}

// ─── 6. CRM Settings ─────────────────────────────────────────────────────────

async function seedSettings() {
  const { count } = await supabase
    .from("crm_settings")
    .select("key", { count: "exact", head: true })
    .eq("organization_id", ORG_ID!);

  if ((count ?? 0) > 0) {
    console.log(`  ⏭  crm_settings ya tiene datos`);
    return;
  }

  const settings = [
    { organization_id: ORG_ID!, key: "business_name",   value: "Mi Negocio" },
    { organization_id: ORG_ID!, key: "business_tagline", value: "Tu CRM personalizado" },
    { organization_id: ORG_ID!, key: "currency",         value: "MXN" },
    { organization_id: ORG_ID!, key: "locale",           value: "es-MX" },
    { organization_id: ORG_ID!, key: "theme",            value: "light" },
    { organization_id: ORG_ID!, key: "language",         value: "es" },
  ];

  await insert("crm_settings", settings);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🚀 Iniciando seed de Supabase...\n");
  console.log(`   URL:     ${SUPABASE_URL}`);
  console.log(`   Org ID:  ${ORG_ID}`);
  console.log(`   User ID: ${USER_ID}\n`);

  console.log("📋 Pipeline stages:");
  const stages = await seedPipelineStages();

  console.log("\n🏢 Companies:");
  const companies = await seedCompanies();

  console.log("\n👥 Contacts:");
  const contacts = await seedContacts(companies);

  console.log("\n💼 Deals:");
  const deals = await seedDeals(contacts, stages);

  console.log("\n📅 Activities:");
  await seedActivities(contacts, deals);

  console.log("\n⚙️  CRM Settings:");
  await seedSettings();

  console.log("\n✅ Seed completado.\n");
  console.log("   Ahora ejecuta: npm run dev");
  console.log("   Y abre: http://localhost:3000\n");
}

main().catch((err) => {
  console.error("\n❌ Error inesperado:", err);
  process.exit(1);
});
