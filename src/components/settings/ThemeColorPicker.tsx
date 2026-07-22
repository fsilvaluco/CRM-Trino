"use client";

import { useState } from "react";
import { Check, Loader2, Palette } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/lib/project-context";
import { THEME_PALETTES, THEME_COLOR_KEYS, type ThemeColorKey } from "@/lib/theme-palettes";
import { cn } from "@/lib/utils";

export function ThemeColorPicker() {
  const { activeProject, setActiveProject } = useProject();
  const [saving, setSaving] = useState<ThemeColorKey | null>(null);

  if (!activeProject) {
    return (
      <p className="text-sm text-muted-foreground">
        Selecciona un proyecto para elegir su color.
      </p>
    );
  }

  const currentColor = (activeProject.themeColor as ThemeColorKey) ?? "azul";

  const handleSelect = async (colorKey: ThemeColorKey) => {
    if (colorKey === currentColor || saving) return;
    setSaving(colorKey);
    try {
      const res = await fetch(`/api/projects/${activeProject.id}/theme`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeColor: colorKey }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "No se pudo cambiar el color");
        return;
      }
      // Actualiza el contexto de inmediato (aplica el CSS al toque, sin
      // esperar el próximo reloadProjects).
      setActiveProject({ ...activeProject, themeColor: colorKey });
      toast.success(`Color de ${activeProject.name} actualizado`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
        <Palette className="h-3.5 w-3.5" />
        Elige el color de <span className="font-medium text-foreground">{activeProject.name}</span>
      </p>
      <div className="grid grid-cols-4 gap-3">
        {THEME_COLOR_KEYS.map((key) => {
          const palette = THEME_PALETTES[key];
          const isSelected = key === currentColor;
          const isSaving = saving === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleSelect(key)}
              disabled={saving !== null}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg p-2 transition-colors",
                "hover:bg-muted disabled:cursor-not-allowed"
              )}
            >
              <span
                className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center ring-2 ring-offset-2 ring-offset-background transition-all",
                  isSelected ? "ring-foreground" : "ring-transparent"
                )}
                style={{ backgroundColor: palette.primary }}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: palette.primaryForeground }} />
                ) : (
                  isSelected && <Check className="h-4 w-4" style={{ color: palette.primaryForeground }} />
                )}
              </span>
              <span className="text-xs text-muted-foreground">{palette.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
