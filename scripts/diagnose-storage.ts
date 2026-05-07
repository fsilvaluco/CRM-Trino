#!/usr/bin/env tsx
/**
 * Diagnóstico de Supabase Storage
 * 
 * Verifica:
 * 1. Variables de entorno configuradas
 * 2. Conexión a Supabase
 * 3. Autenticación del usuario
 * 4. Bucket 'finances' existe
 * 5. Políticas RLS aplicadas
 * 6. Puede leer archivos del bucket
 * 
 * Uso: npm run diagnose-storage
 */

// Cargar variables de entorno desde .env.local
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[36m";
const RESET = "\x1b[0m";

function log(emoji: string, message: string, color = RESET) {
  console.log(`${color}${emoji} ${message}${RESET}`);
}

async function diagnoseStorage() {
  console.log(`\n${BLUE}${"=".repeat(60)}`);
  console.log("🔍 Diagnóstico de Supabase Storage");
  console.log(`${"=".repeat(60)}${RESET}\n`);

  // 1. Verificar variables de entorno
  log("1️⃣", "Verificando variables de entorno...", BLUE);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    log("❌", "NEXT_PUBLIC_SUPABASE_URL no está configurada", RED);
    log("💡", "Crea un archivo .env.local con tus credenciales de Supabase", YELLOW);
    process.exit(1);
  }
  if (!supabaseAnonKey) {
    log("❌", "NEXT_PUBLIC_SUPABASE_ANON_KEY no está configurada", RED);
    log("💡", "Crea un archivo .env.local con tus credenciales de Supabase", YELLOW);
    process.exit(1);
  }

  log("✅", `URL: ${supabaseUrl}`, GREEN);
  log("✅", `ANON_KEY: ${supabaseAnonKey.slice(0, 20)}...`, GREEN);

  // 2. Crear cliente de Supabase
  log("\n2️⃣", "Conectando a Supabase...", BLUE);
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  log("✅", "Cliente de Supabase creado", GREEN);

  // 3. Verificar bucket existe
  log("\n3️⃣", "Verificando bucket 'finances'...", BLUE);
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

  if (bucketsError) {
    log("❌", `Error listando buckets: ${bucketsError.message}`, RED);
    log("💡", "Verifica que las credenciales sean correctas", YELLOW);
    process.exit(1);
  }

  const financesBucket = buckets?.find((b) => b.name === "finances");
  if (!financesBucket) {
    log("❌", "Bucket 'finances' no existe", RED);
    log("💡", "Crea el bucket en Supabase Dashboard → Storage", YELLOW);
    process.exit(1);
  }

  log("✅", `Bucket 'finances' existe`, GREEN);
  log("   ", `  - Público: ${financesBucket.public ? "Sí ⚠️" : "No ✓"}`);
  log("   ", `  - ID: ${financesBucket.id}`);

  // 4. Listar archivos del bucket (sin autenticación)
  log("\n4️⃣", "Listando archivos del bucket...", BLUE);
  const { data: files, error: listError } = await supabase.storage
    .from("finances")
    .list("receipts", { limit: 5 });

  if (listError) {
    log("❌", `Error listando archivos: ${listError.message}`, RED);
    
    if (listError.message.includes("not found")) {
      log("💡", "El bucket existe pero no se puede acceder", YELLOW);
      log("💡", "Posibles causas:", YELLOW);
      log("   ", "  1. Las políticas RLS no están aplicadas");
      log("   ", "  2. No hay carpeta 'receipts' aún");
      log("   ", "  3. Las credenciales son incorrectas");
    }
    
    if (listError.message.includes("row-level security")) {
      log("💡", "Las políticas RLS no están configuradas", YELLOW);
      log("💡", "Ejecuta: scripts/migrations/002_finances_storage_setup.sql", YELLOW);
    }
  } else if (!files || files.length === 0) {
    log("⚠️", "No hay archivos en el bucket (es normal si es nuevo)", YELLOW);
  } else {
    log("✅", `${files.length} archivos encontrados:`, GREEN);
    files.forEach((f) => {
      log("   ", `  - ${f.name}`);
    });
  }

  // 5. Verificar políticas RLS
  log("\n5️⃣", "Verificando políticas RLS...", BLUE);
  
  // Para verificar políticas, necesitamos service_role key (admin)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!serviceRoleKey) {
    log("⚠️", "SUPABASE_SERVICE_ROLE_KEY no configurada (opcional)", YELLOW);
    log("💡", "No se pueden verificar las políticas RLS sin esta key", YELLOW);
  } else {
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: policies, error: policiesError } = await adminClient
      .from("pg_policies")
      .select("policyname, cmd")
      .eq("schemaname", "storage")
      .eq("tablename", "objects")
      .like("policyname", "%finances%");

    if (policiesError) {
      log("⚠️", `No se pudieron verificar políticas: ${policiesError.message}`, YELLOW);
    } else if (!policies || policies.length === 0) {
      log("❌", "No hay políticas RLS configuradas para 'finances'", RED);
      log("💡", "Ejecuta la migración: scripts/migrations/002_finances_storage_setup.sql", YELLOW);
    } else {
      log("✅", `${policies.length} políticas RLS encontradas:`, GREEN);
      policies.forEach((p) => {
        log("   ", `  - ${p.policyname} (${p.cmd})`);
      });
    }
  }

  // 6. Probar getPublicUrl
  log("\n6️⃣", "Probando getPublicUrl()...", BLUE);
  const testPath = "receipts/test/example.png";
  const { data: urlData } = supabase.storage.from("finances").getPublicUrl(testPath);
  
  log("✅", `URL generada: ${urlData.publicUrl}`, GREEN);
  log("💡", "Nota: getPublicUrl() siempre genera una URL, pero puede dar 404 si:", YELLOW);
  log("   ", "  1. El archivo no existe");
  log("   ", "  2. Las políticas RLS bloquean el acceso");
  log("   ", "  3. El bucket no es público (como debe ser 'finances')");

  // Resumen
  console.log(`\n${BLUE}${"=".repeat(60)}`);
  log("📋", "RESUMEN", BLUE);
  console.log(`${"=".repeat(60)}${RESET}\n`);

  log("✅", "Variables de entorno: OK", GREEN);
  log(financesBucket ? "✅" : "❌", `Bucket 'finances': ${financesBucket ? "OK" : "NO EXISTE"}`, financesBucket ? GREEN : RED);
  
  if (listError) {
    log("❌", "Acceso a archivos: BLOQUEADO", RED);
    log("💡", "ACCIÓN REQUERIDA:", YELLOW);
    log("   ", "1. Ve a Supabase Dashboard → SQL Editor");
    log("   ", "2. Ejecuta: scripts/migrations/002_finances_storage_setup.sql");
    log("   ", "3. Verifica que las 4 políticas se crearon correctamente");
  } else {
    log("✅", "Acceso a archivos: OK", GREEN);
  }

  console.log();
}

diagnoseStorage().catch((error) => {
  console.error(`\n${RED}❌ Error fatal:${RESET}`, error);
  process.exit(1);
});
