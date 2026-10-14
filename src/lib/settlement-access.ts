// Carga una liquidacion para una ruta del EQUIPO y chequea el permiso de
// Finanzas en su proyecto. Lo usan las rutas de firmantes externos y la
// firma interna con codigo (migracion 110), que necesitaban todas el mismo
// "existe + es de mi org + tengo acceso al proyecto + mi rol puede X".

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getProjectPermissions, canViewModule, canEditModule } from "@/lib/project-roles";

export interface SettlementRow {
  id: string;
  project_id: string;
  organization_id: string;
  type: string;
  payer_name: string;
  payee_name: string;
  currency: string | null;
  payout_amount: number;
  period_month: number | null;
  period_year: number | null;
  required_signer_ids: string[] | null;
}

export async function loadSettlementForTeam(id: string, need: "ver" | "editar") {
  const { supabase, user, orgId, allowedProjectIds, error } = await requireAuth();
  if (error) return { error };

  const { data: settlement } = await supabase
    .from("settlements")
    .select(
      "id, project_id, organization_id, type, payer_name, payee_name, currency, payout_amount, period_month, period_year, required_signer_ids"
    )
    .eq("id", id)
    .eq("organization_id", orgId!)
    .is("deleted_at", null)
    .maybeSingle();

  if (!settlement) {
    return { error: NextResponse.json({ error: "Liquidación no encontrada" }, { status: 404 }) };
  }
  if (!allowedProjectIds.includes(settlement.project_id)) {
    return { error: NextResponse.json({ error: "Sin acceso a este proyecto" }, { status: 403 }) };
  }

  const perm = await getProjectPermissions(supabase, user!.id, settlement.project_id);
  const ok = need === "editar" ? canEditModule(perm, "finanzas") : canViewModule(perm, "finanzas");
  if (!ok) {
    return {
      error: NextResponse.json(
        { error: need === "editar" ? "Tu rol no puede gestionar firmas de liquidaciones en este proyecto" : "Sin acceso a Finanzas para tu rol" },
        { status: 403 }
      ),
    };
  }

  return {
    error: null,
    supabase,
    user: user!,
    perm,
    settlement: settlement as SettlementRow,
    canEdit: canEditModule(perm, "finanzas"),
  };
}

export function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function settlementPeriodLabel(month: number | null, year: number | null): string | null {
  if (month && year) return `${MONTHS[month - 1]} ${year}`;
  return year ? String(year) : null;
}
