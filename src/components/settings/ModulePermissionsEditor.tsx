"use client";

// Matriz persona × módulo (Ver / Editar / Eliminar / Ve ingresos / Ve
// costos) para UN proyecto puntual -- el "Gestor de Integrantes" que
// faltaba (ROLES.md Prioridad 6). Antes de esto, el permiso real
// (project_member_permissions) solo se podía tocar a mano en la base de
// datos: el rol (Admin/Miembro/Artista/Staff) del MemberAccessSheet es
// solo una plantilla de partida al agregar a alguien, no lo vuelve a tocar
// después (ver seedTemplateMatrix).

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save } from "lucide-react";

type ModuleKey = "contactos" | "empresas" | "deals" | "tareas" | "eventos" | "campanas" | "finanzas";

interface ModulePermission {
  puedeVer: boolean;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  veIngresos: boolean;
  veCostos: boolean;
}

const MODULE_LABELS: Record<ModuleKey, string> = {
  contactos: "Contactos",
  empresas: "Empresas",
  deals: "Tratos",
  tareas: "Tareas",
  eventos: "Eventos",
  campanas: "Campañas",
  finanzas: "Finanzas",
};

const MODULE_ORDER: ModuleKey[] = ["contactos", "empresas", "deals", "tareas", "eventos", "campanas", "finanzas"];

const EMPTY: ModulePermission = { puedeVer: false, puedeEditar: false, puedeEliminar: false, veIngresos: false, veCostos: false };

// "Ve ingresos"/"Ve costos" solo tienen sentido en Deals (comisiones/valor
// del trato) y Eventos (fee, entradas, gastos, planilla) -- en el resto de
// módulos esas dos columnas quedan deshabilitadas (siempre false).
function hasMoneyColumns(module: ModuleKey): boolean {
  return module === "deals" || module === "eventos";
}

export function ModulePermissionsEditor({ projectId, userId }: { projectId: string; userId: string }) {
  const [modules, setModules] = useState<Record<ModuleKey, ModulePermission> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/project-members/permissions?projectId=${projectId}&userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.modules) setModules(data.modules);
        else toast.error(data?.error ?? "No se pudo cargar la matriz de permisos");
      })
      .catch(() => { if (!cancelled) toast.error("No se pudo cargar la matriz de permisos"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, userId]);

  const toggle = (module: ModuleKey, field: keyof ModulePermission, value: boolean) => {
    setModules((prev) => {
      if (!prev) return prev;
      const current = prev[module] ?? EMPTY;
      // Sin puedeVer no tiene sentido dejar prendido editar/eliminar/ver plata.
      const next: ModulePermission = { ...current, [field]: value };
      if (field === "puedeVer" && !value) {
        next.puedeEditar = false;
        next.puedeEliminar = false;
        next.veIngresos = false;
        next.veCostos = false;
      }
      return { ...prev, [module]: next };
    });
  };

  const handleSave = async () => {
    if (!modules) return;
    setSaving(true);
    try {
      const res = await fetch("/api/project-members/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, userId, modules }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo guardar la matriz de permisos");
        return;
      }
      toast.success("Permisos actualizados");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando permisos...
      </div>
    );
  }
  if (!modules) return null;

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-2 space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-medium py-1 pr-2">Módulo</th>
              <th className="font-medium px-1.5">Ver</th>
              <th className="font-medium px-1.5">Editar</th>
              <th className="font-medium px-1.5">Eliminar</th>
              <th className="font-medium px-1.5">Ve $ (ingresos)</th>
              <th className="font-medium px-1.5">Ve $ (costos)</th>
            </tr>
          </thead>
          <tbody>
            {MODULE_ORDER.map((module) => {
              const perm = modules[module] ?? EMPTY;
              const money = hasMoneyColumns(module);
              return (
                <tr key={module} className="border-t border-border/40">
                  <td className="py-1 pr-2 font-medium">{MODULE_LABELS[module]}</td>
                  <td className="text-center px-1.5">
                    <Checkbox checked={perm.puedeVer} onCheckedChange={(v) => toggle(module, "puedeVer", v === true)} />
                  </td>
                  <td className="text-center px-1.5">
                    <Checkbox
                      checked={perm.puedeEditar}
                      disabled={!perm.puedeVer}
                      onCheckedChange={(v) => toggle(module, "puedeEditar", v === true)}
                    />
                  </td>
                  <td className="text-center px-1.5">
                    <Checkbox
                      checked={perm.puedeEliminar}
                      disabled={!perm.puedeVer}
                      onCheckedChange={(v) => toggle(module, "puedeEliminar", v === true)}
                    />
                  </td>
                  <td className="text-center px-1.5">
                    <Checkbox
                      checked={money && perm.veIngresos}
                      disabled={!money || !perm.puedeVer}
                      onCheckedChange={(v) => toggle(module, "veIngresos", v === true)}
                    />
                  </td>
                  <td className="text-center px-1.5">
                    <Checkbox
                      checked={money && perm.veCostos}
                      disabled={!money || !perm.puedeVer}
                      onCheckedChange={(v) => toggle(module, "veCostos", v === true)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button type="button" size="sm" className="h-7 text-xs cursor-pointer" disabled={saving} onClick={handleSave}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          Guardar permisos
        </Button>
      </div>
    </div>
  );
}
