import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import {
  getProjectPermissions,
  canViewModule,
  canEditModule,
  canViewEventCosts,
  canEditEventCosts,
} from "@/lib/project-roles";

// Acceso al módulo de Giras. Mientras no exista un módulo "giras" propio en
// la matriz de permisos, la gira se rige por el módulo "eventos" del
// proyecto dueño: ver = ver eventos, editar = editar eventos, presupuesto
// y canjes con plata = ver/editar costos de eventos. Mismo aislamiento por
// proyecto que /api/eventos/[id] (allowedProjectIds + ?projectId activo).

export interface TourAccess {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tour: any;
  canEdit: boolean;
  canViewCosts: boolean;
  canEditCosts: boolean;
}

type Need = "view" | "edit" | "costs" | "editCosts";

function deny(message: string, status: number) {
  return { access: null, error: NextResponse.json({ error: message }, { status }) } as const;
}

export async function requireTourAccess(
  tourId: string,
  need: Need = "view",
  activeProjectId?: string | null
): Promise<{ access: TourAccess; error: null } | { access: null; error: NextResponse }> {
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return { access: null, error };

  const { data: tour } = await supabase.from("tours").select("*").eq("id", tourId).maybeSingle();
  if (!tour) return deny("Gira no encontrada", 404);
  if (!allowedProjectIds?.includes(tour.project_id)) return deny("No tienes acceso a este proyecto", 403);
  if (activeProjectId && activeProjectId !== tour.project_id) {
    return deny("Esta gira pertenece a otro proyecto -- cambia el selector para verla", 403);
  }

  const perms = await getProjectPermissions(supabase, user!.id, tour.project_id);
  if (!canViewModule(perms, "eventos")) return deny("No tienes acceso a Giras en este proyecto", 403);

  const access: TourAccess = {
    supabase,
    userId: user!.id,
    tour,
    canEdit: canEditModule(perms, "eventos"),
    canViewCosts: canViewEventCosts(perms),
    canEditCosts: canEditEventCosts(perms),
  };

  if (need === "edit" && !access.canEdit) return deny("No tienes permiso para editar esta gira", 403);
  if (need === "costs" && !access.canViewCosts) return deny("No tienes acceso al presupuesto de la gira", 403);
  if (need === "editCosts" && !access.canEditCosts) return deny("No tienes permiso para editar el presupuesto", 403);

  return { access, error: null };
}
