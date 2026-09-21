"use client";

import { Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { SMARTLINK_THEMES } from "@/lib/smartlink-themes";

// Muestras circulares del catalogo de temas: fondo del tema + una barrita
// del color del boton de plataforma, para ver el contraste real antes de
// guardar.
export function SmartlinkThemePicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const current = SMARTLINK_THEMES.find((t) => t.key === value);
  return (
    <div className="space-y-2">
      <Label>Color de la página</Label>
      <div className="flex flex-wrap gap-2">
        {SMARTLINK_THEMES.map((t) => {
          const selected = t.key === value;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              title={t.label}
              aria-label={t.label}
              aria-pressed={selected}
              className={`relative h-9 w-9 rounded-full border-2 cursor-pointer transition-transform hover:scale-105 ${
                selected ? "border-primary" : "border-border"
              }`}
              style={{ backgroundColor: t.bg }}
            >
              <span className="absolute inset-x-2 bottom-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.btnBg }} />
              {selected && <Check className="absolute inset-0 m-auto h-4 w-4" style={{ color: t.fg }} />}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{current?.label} — elige uno que combine con la carátula.</p>
    </div>
  );
}
