#!/usr/bin/env npx tsx
/**
 * Asigna todos los proyectos de la organización a un usuario específico en project_members.
 * Uso: npx tsx scripts/assign-all-projects.ts francisco@katarsis.music
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const email = process.argv[2];
if (!email) {
  console.error("Uso: npx tsx scripts/assign-all-projects.ts <email>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Buscar usuario por email
  const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (usersError) { console.error("Error listando usuarios:", usersError.message); process.exit(1); }

  const user = usersData.users.find((u) => u.email === email);
  if (!user) { console.error(`Usuario no encontrado: ${email}`); process.exit(1); }

  console.log(`Usuario encontrado: ${user.id} (${user.email})`);

  // 2. Obtener organización del usuario
  const { data: memberRow, error: memberError } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  if (memberError || !memberRow) {
    console.error("Error obteniendo organización:", memberError?.message ?? "No encontrada");
    process.exit(1);
  }

  const orgId = memberRow.organization_id;
  console.log(`Organización: ${orgId}`);

  // 3. Obtener todos los proyectos de la organización
  const { data: projects, error: projectsError } = await admin
    .from("projects")
    .select("id, name")
    .eq("organization_id", orgId);

  if (projectsError) { console.error("Error obteniendo proyectos:", projectsError.message); process.exit(1); }
  if (!projects || projects.length === 0) { console.log("No hay proyectos en la organización."); process.exit(0); }

  console.log(`Proyectos encontrados: ${projects.length}`);

  // 4. Insertar en project_members (upsert para no duplicar)
  const rows = projects.map((p) => ({
    user_id: user.id,
    project_id: p.id,
    organization_id: orgId,
  }));

  const { error: upsertError } = await admin
    .from("project_members")
    .upsert(rows, { onConflict: "user_id,project_id" });

  if (upsertError) { console.error("Error asignando proyectos:", upsertError.message); process.exit(1); }

  console.log(`\n✓ ${projects.length} proyectos asignados a ${email}:`);
  for (const p of projects) {
    console.log(`  - ${p.name} (${p.id})`);
  }
}

main();
