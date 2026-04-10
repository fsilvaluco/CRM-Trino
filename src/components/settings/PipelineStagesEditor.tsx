"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface Stage {
  id: string;           // real id o "_new_<n>" para nuevas
  name: string;
  color: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
  _isNew?: boolean;
  _dirty?: boolean;
}

let newCounter = 0;

export function PipelineStagesEditor() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const colorRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = () => {
    fetch("/api/pipeline")
      .then((r) => r.json())
      .then((data: Stage[]) => {
        setStages(
          data.map((s) => ({ ...s, _isNew: false, _dirty: false }))
        );
        setDeletedIds([]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // ── Local mutations ──────────────────────────────────────────────────────
  const update = (id: string, patch: Partial<Stage>) => {
    setStages((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch, _dirty: true } : s))
    );
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setStages((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next.map((s, i) => ({ ...s, order: i + 1, _dirty: true }));
    });
  };

  const moveDown = (idx: number) => {
    setStages((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next.map((s, i) => ({ ...s, order: i + 1, _dirty: true }));
    });
  };

  const addStage = () => {
    newCounter += 1;
    setStages((prev) => [
      ...prev,
      {
        id: `_new_${newCounter}`,
        name: "Nueva etapa",
        color: "#64748b",
        order: prev.length + 1,
        isWon: false,
        isLost: false,
        _isNew: true,
        _dirty: true,
      },
    ]);
  };

  const removeStage = (id: string, isNew: boolean) => {
    setStages((prev) => prev.filter((s) => s.id !== id));
    if (!isNew) setDeletedIds((prev) => [...prev, id]);
  };

  const setWonLost = (id: string, field: "isWon" | "isLost") => {
    setStages((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        // Toggle: if already set, clear it; else set it and clear the other
        const current = s[field];
        return {
          ...s,
          isWon: field === "isWon" ? !current : false,
          isLost: field === "isLost" ? !current : false,
          _dirty: true,
        };
      })
    );
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const invalid = stages.find((s) => !s.name.trim());
    if (invalid) { toast.error("Todos los nombres deben estar completos"); return; }

    setSaving(true);
    try {
      // 1. Delete removed stages
      for (const id of deletedIds) {
        const res = await fetch(`/api/pipeline/stages/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const err = await res.json();
          toast.error(err.error ?? "Error eliminando etapa");
          setSaving(false);
          return;
        }
      }

      // 2. Create new / update existing — respect order array
      for (let i = 0; i < stages.length; i++) {
        const s = { ...stages[i], order: i + 1 };
        if (!s._dirty) continue;

        if (s._isNew) {
          await fetch("/api/pipeline/stages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: s.name.trim(),
              color: s.color,
              isWon: s.isWon,
              isLost: s.isLost,
              order: s.order,
            }),
          });
        } else {
          await fetch(`/api/pipeline/stages/${s.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: s.name.trim(),
              color: s.color,
              isWon: s.isWon,
              isLost: s.isLost,
              order: s.order,
            }),
          });
        }
      }

      toast.success("Etapas guardadas");
      load();
    } catch {
      toast.error("Error guardando cambios");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-11 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  const hasDirty = stages.some((s) => s._dirty) || deletedIds.length > 0;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {stages.map((stage, idx) => (
          <div
            key={stage.id}
            className="flex items-center gap-2 p-2 rounded-lg border bg-card"
          >
            {/* Color swatch → abre input[type=color] oculto */}
            <button
              type="button"
              title="Cambiar color"
              className="w-7 h-7 rounded-full border-2 border-border shrink-0 cursor-pointer hover:scale-110 transition-transform"
              style={{ backgroundColor: stage.color }}
              onClick={() => colorRefs.current[stage.id]?.click()}
            />
            <input
              type="color"
              className="sr-only"
              value={stage.color}
              ref={(el) => { colorRefs.current[stage.id] = el; }}
              onChange={(e) => update(stage.id, { color: e.target.value })}
            />

            {/* Nombre */}
            <Input
              className="flex-1 h-8 text-sm"
              value={stage.name}
              onChange={(e) => update(stage.id, { name: e.target.value })}
              placeholder="Nombre de etapa"
            />

            {/* Badges Won / Lost */}
            <button
              type="button"
              title="Marcar como Ganado"
              onClick={() => setWonLost(stage.id, "isWon")}
              className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-colors cursor-pointer ${
                stage.isWon
                  ? "bg-green-100 text-green-700 border-green-300"
                  : "text-muted-foreground border-border hover:border-green-300"
              }`}
            >
              Ganado
            </button>
            <button
              type="button"
              title="Marcar como Perdido"
              onClick={() => setWonLost(stage.id, "isLost")}
              className={`text-xs px-2 py-0.5 rounded-full border font-medium transition-colors cursor-pointer ${
                stage.isLost
                  ? "bg-red-100 text-red-700 border-red-300"
                  : "text-muted-foreground border-border hover:border-red-300"
              }`}
            >
              Perdido
            </button>

            {/* Reordenar */}
            <div className="flex flex-col gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                className="p-0.5 rounded hover:bg-muted disabled:opacity-30 cursor-pointer"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => moveDown(idx)}
                disabled={idx === stages.length - 1}
                className="p-0.5 rounded hover:bg-muted disabled:opacity-30 cursor-pointer"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>

            {/* Eliminar */}
            <button
              type="button"
              title="Eliminar etapa"
              onClick={() => removeStage(stage.id, stage._isNew ?? false)}
              className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={addStage} className="cursor-pointer">
          <Plus className="h-3.5 w-3.5 mr-1" />
          Agregar etapa
        </Button>

        <Button
          size="sm"
          disabled={!hasDirty || saving}
          onClick={handleSave}
          className="cursor-pointer ml-auto"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1" />
          )}
          Guardar cambios
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Haz clic en el circulo de color para cambiarlo. Solo puede haber una etapa de &quot;Ganado&quot; y una de &quot;Perdido&quot;.
      </p>
    </div>
  );
}
