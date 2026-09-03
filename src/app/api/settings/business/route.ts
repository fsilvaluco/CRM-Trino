import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { CrmConfig } from "@/types";
import { requireAuth } from "@/lib/supabase-server";

function getConfigPath() {
  return join(process.cwd(), "crm-config.json");
}

function getPublicConfigPath() {
  return join(process.cwd(), "public", "crm-config.json");
}

function readConfig(): CrmConfig {
  try {
    const raw = readFileSync(getConfigPath(), "utf-8");
    return JSON.parse(raw) as CrmConfig;
  } catch {
    const raw = readFileSync(getPublicConfigPath(), "utf-8");
    return JSON.parse(raw) as CrmConfig;
  }
}

export async function GET() {
  try {
    const config = readConfig();
    return NextResponse.json({
      business: config.business,
      preferences: config.preferences,
    });
  } catch {
    return NextResponse.json({ error: "No se pudo leer la configuración" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  // Config de negocio global (nombre, industria, tema) -- sin este check
  // cualquiera podia sobreescribirla sin sesion (CN-007, auditoria 3 sep
  // 2026). Solo owner/admin de la organizacion puede modificarla.
  const { isAdmin, error } = await requireAuth();
  if (error) return error;
  if (!isAdmin) {
    return NextResponse.json({ error: "Solo administradores pueden modificar esta configuración" }, { status: 403 });
  }

  try {
    const body = await request.json() as {
      business?: Partial<CrmConfig["business"]>;
      preferences?: Partial<CrmConfig["preferences"]>;
    };

    const config = readConfig();

    const updated: CrmConfig = {
      ...config,
      business: { ...config.business, ...body.business },
      preferences: { ...config.preferences, ...body.preferences },
    };

    const json = JSON.stringify(updated, null, 2);
    writeFileSync(getConfigPath(), json, "utf-8");
    writeFileSync(getPublicConfigPath(), json, "utf-8");

    return NextResponse.json({ business: updated.business, preferences: updated.preferences });
  } catch {
    return NextResponse.json({ error: "No se pudo guardar la configuración" }, { status: 500 });
  }
}
