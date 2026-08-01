"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, DollarSign, Briefcase, CheckSquare, Users2, Target } from "lucide-react";
import { useLocale } from "@/lib/locale-context";

type GoalMetricType = "ventas_deals" | "cantidad_deals" | "tareas_completadas" | "seguidores" | "manual";
type GoalPeriodType = "monthly" | "annual" | "custom";

interface Goal {
  id: string;
  projectId: string;
  metricType: GoalMetricType;
  title: string;
  targetValue: number;
  currentValue: number;
  periodType: GoalPeriodType;
  periodStart: string | null;
  periodEnd: string | null;
}

const METRIC_CONFIG: Record<GoalMetricType, { icon: typeof Target; label: string; isCurrency?: boolean }> = {
  ventas_deals: { icon: DollarSign, label: "Ventas ganadas", isCurrency: true },
  cantidad_deals: { icon: Briefcase, label: "Deals ganados" },
  tareas_completadas: { icon: CheckSquare, label: "Tareas completadas" },
  seguidores: { icon: Users2, label: "Crecimiento de seguidores" },
  manual: { icon: Target, label: "Meta manual" },
};

const PERIOD_LABELS: Record<GoalPeriodType, string> = {
  monthly: "Este mes",
  annual: "Este año",
  custom: "Rango personalizado",
};

function GoalFormDialog({
  open,
  onClose,
  projectId,
  editingGoal,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  editingGoal: Goal | null;
  onSaved: () => void;
}) {
  const [metricType, setMetricType] = useState<GoalMetricType>("manual");
  const [title, setTitle] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [periodType, setPeriodType] = useState<GoalPeriodType>("monthly");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingGoal) {
      setMetricType(editingGoal.metricType);
      setTitle(editingGoal.title);
      setTargetValue(String(editingGoal.targetValue));
      setCurrentValue(String(editingGoal.currentValue));
      setPeriodType(editingGoal.periodType);
      setPeriodStart(editingGoal.periodStart ?? "");
      setPeriodEnd(editingGoal.periodEnd ?? "");
    } else {
      setMetricType("manual");
      setTitle("");
      setTargetValue("");
      setCurrentValue("");
      setPeriodType("monthly");
      setPeriodStart("");
      setPeriodEnd("");
    }
  }, [open, editingGoal]);

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Ponle un nombre a la meta");
      return;
    }
    if (periodType === "custom" && (!periodStart || !periodEnd)) {
      toast.error("Un rango personalizado necesita fecha de inicio y de fin");
      return;
    }
    setSaving(true);
    try {
      const url = editingGoal ? `/api/goals/${editingGoal.id}` : "/api/goals";
      const method = editingGoal ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          metricType,
          title: title.trim(),
          targetValue: Number(targetValue) || 0,
          currentValue: Number(currentValue) || 0,
          periodType,
          periodStart: periodType === "custom" ? periodStart : null,
          periodEnd: periodType === "custom" ? periodEnd : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al guardar la meta");
      }
      toast.success(editingGoal ? "Meta actualizada" : "Meta creada");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar la meta");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{editingGoal ? "Editar meta" : "Nueva meta"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!editingGoal && (
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={metricType} onValueChange={(v) => setMetricType(v as GoalMetricType)}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(METRIC_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ej. Vender $2.000.000 este mes" />
          </div>

          <div className="space-y-2">
            <Label>Meta (número objetivo)</Label>
            <Input type="number" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
          </div>

          {metricType === "manual" && (
            <div className="space-y-2">
              <Label>Valor actual</Label>
              <Input type="number" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} />
            </div>
          )}

          <div className="space-y-2">
            <Label>Período</Label>
            <Select value={periodType} onValueChange={(v) => setPeriodType(v as GoalPeriodType)}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensual (se resetea cada mes)</SelectItem>
                <SelectItem value="annual">Anual (se resetea cada año)</SelectItem>
                <SelectItem value="custom">Rango de fechas personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {periodType === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Desde</Label>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hasta</Label>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving} className="cursor-pointer">
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GoalsPanel({ projectId }: { projectId: string }) {
  const { formatCurrency } = useLocale();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const loadGoals = useCallback(() => {
    setLoading(true);
    fetch(`/api/goals?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => setGoals(Array.isArray(d) ? d : []))
      .catch(() => setGoals([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  async function handleDelete(goal: Goal) {
    if (!confirm(`¿Borrar la meta "${goal.title}"? No la vas a usar más en este proyecto.`)) return;
    try {
      const res = await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setGoals((prev) => prev.filter((g) => g.id !== goal.id));
      toast.success("Meta eliminada");
    } catch {
      toast.error("No se pudo eliminar la meta");
    }
  }

  function formatValue(goal: Goal, value: number) {
    if (METRIC_CONFIG[goal.metricType].isCurrency) return formatCurrency(Math.round(value * 100));
    return Math.round(value).toLocaleString("es-CL");
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">Metas</h2>
        <Button
          size="sm"
          variant="outline"
          className="cursor-pointer"
          onClick={() => {
            setEditingGoal(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Nueva meta
        </Button>
      </div>

      {goals.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg">
          Este proyecto no tiene metas activas. Agrega una para empezar a seguirla.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.map((goal) => {
            const Icon = METRIC_CONFIG[goal.metricType].icon;
            const pct = goal.targetValue > 0 ? Math.min(100, (goal.currentValue / goal.targetValue) * 100) : 0;
            const over = goal.targetValue > 0 && goal.currentValue > goal.targetValue;
            return (
              <Card key={goal.id} className="relative group">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg p-1.5 bg-primary/10">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <p className="text-sm font-medium leading-snug">{goal.title}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingGoal(goal);
                        setFormOpen(true);
                      }}
                      className="text-muted-foreground hover:text-foreground cursor-pointer p-1"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(goal)}
                      className="text-muted-foreground hover:text-destructive cursor-pointer p-1"
                      title="Borrar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-lg font-bold">{formatValue(goal, goal.currentValue)}</span>
                    <span className="text-xs text-muted-foreground">
                      de {formatValue(goal, goal.targetValue)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${over ? "bg-green-600" : "bg-primary"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {goal.periodType === "custom" && goal.periodStart && goal.periodEnd
                      ? `${goal.periodStart} → ${goal.periodEnd}`
                      : PERIOD_LABELS[goal.periodType]}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <GoalFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        projectId={projectId}
        editingGoal={editingGoal}
        onSaved={loadGoals}
      />
    </div>
  );
}
