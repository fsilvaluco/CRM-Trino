"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Info } from "lucide-react";
import { useProject } from "@/lib/project-context";

interface AliasRule {
  id: string;
  pattern: string;
  targetProjectId: string;
  targetProjectName: string | null;
  notes: string | null;
}

export function AliasRulesPanel() {
  const { projects, isAdmin } = useProject();
  const [rules, setRules] = useState<AliasRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [pattern, setPattern] = useState("");
  const [targetProjectId, setTargetProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/alias-rules");
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
    } catch {
      toast.error("No se pudieron cargar las reglas de alias");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim() || !targetProjectId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/alias-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: pattern.trim(), targetProjectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo crear la regla");
        return;
      }
      toast.success("Regla creada");
      setPattern("");
      setTargetProjectId("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      const res = await fetch(`/api/settings/alias-rules/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo eliminar");
        return;
      }
      await load();
    } finally {
      setRemovingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <p className="text-sm text-muted-foreground">
        Solo un admin puede configurar reglas de alias.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          Usa esto cuando un dominio (ej. <code>sisoy.cl</code>) llega como alias a otra
          bandeja (ej. <code>somostrino.cl</code>). El detector va a revisar el destinatario
          real del correo y anclar el lead al proyecto correcto, sin importar en que bandeja
          conectada fisicamente llego el mensaje.
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
        <Input
          placeholder="Patron: @sisoy.cl o correo@sisoy.cl"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          className="flex-1 min-w-[200px]"
        />
        <Select value={targetProjectId} onValueChange={(v) => v && setTargetProjectId(v)}>
          <SelectTrigger className="w-48 cursor-pointer">
            <span className={targetProjectId ? "" : "text-muted-foreground"}>
              {projects.find((p) => p.id === targetProjectId)?.name ?? "Proyecto destino"}
            </span>
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={saving} className="cursor-pointer">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
          Agregar regla
        </Button>
      </form>

      {loading ? (
        <div className="h-12 bg-muted rounded-lg animate-pulse" />
      ) : rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay reglas de alias configuradas.</p>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">{r.pattern}</Badge>
                <span className="text-muted-foreground">→</span>
                <span className="font-medium">{r.targetProjectName ?? "?"}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="cursor-pointer text-destructive hover:text-destructive"
                disabled={removingId === r.id}
                onClick={() => handleRemove(r.id)}
              >
                {removingId === r.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
