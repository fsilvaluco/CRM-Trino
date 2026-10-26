"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";
import { AddTourCostDialog } from "@/components/tours/AddTourCostDialog";
import { BUDGET_CATEGORY_LABEL, shortDate } from "@/components/tours/labels";
import type { TourDetail } from "@/types/tours";

export function TourBudgetTab({ data, onChanged }: { data: TourDetail; onChanged: () => void }) {
  const { formatCurrency } = useLocale();
  const [adding, setAdding] = useState(false);
  const budget = data.budget;
  if (!budget) return null;

  const cats = budget.categories.filter((c) => c.budgeted || c.realAmount || c.canjeConfirmado || c.canjeEnCurso);
  const sum = (k: "budgeted" | "canjeConfirmado" | "canjeEnCurso" | "netBudget" | "realAmount") => cats.reduce((a, c) => a + c[k], 0);
  const money = (v: number) => (v ? formatCurrency(v) : "—");
  const lineLabel = new Map(budget.lines.map((l) => [l.id, l.label]));

  async function removeCost(id: string) {
    if (!confirm("¿Eliminar este gasto?")) return;
    const res = await fetch(`/api/giras/${data.tour.id}/costos/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("No se pudo eliminar");
    onChanged();
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Neto = presupuesto − canjes confirmados. Real = gastos de la gira + Planillas de cada fecha (por categoría). Los canjes en curso son lo que podría bajar si se cierran.
        </p>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                {["Partida", "Presupuesto", "Canjes confirmados", "Canjes en curso", "Neto", "Real", "Diferencia"].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.category} className="border-t align-top">
                  <td className="px-3 py-2">
                    <p className="font-medium">{BUDGET_CATEGORY_LABEL[c.category]}</p>
                    <ul className="text-xs text-muted-foreground">
                      {budget.lines.filter((l) => l.category === c.category).map((l) => (
                        <li key={l.id}>{l.label}: {formatCurrency(l.budgetedAmount)}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{money(c.budgeted)}</td>
                  <td className="px-3 py-2 tabular-nums text-emerald-700">{c.canjeConfirmado ? `−${formatCurrency(c.canjeConfirmado)}` : "—"}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{money(c.canjeEnCurso)}</td>
                  <td className="px-3 py-2 tabular-nums font-medium">{money(c.netBudget)}</td>
                  <td className="px-3 py-2 tabular-nums">{money(c.realAmount)}</td>
                  <td className={`px-3 py-2 tabular-nums ${c.variance > 0 && c.realAmount > 0 ? "text-red-600" : ""}`}>
                    {c.realAmount ? `${c.variance > 0 ? "+" : ""}${formatCurrency(c.variance)}` : "—"}
                  </td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30 font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 tabular-nums">{money(sum("budgeted"))}</td>
                <td className="px-3 py-2 tabular-nums text-emerald-700">{sum("canjeConfirmado") ? `−${formatCurrency(sum("canjeConfirmado"))}` : "—"}</td>
                <td className="px-3 py-2 tabular-nums">{money(sum("canjeEnCurso"))}</td>
                <td className="px-3 py-2 tabular-nums">{money(sum("netBudget"))}</td>
                <td className="px-3 py-2 tabular-nums">{money(sum("realAmount"))}</td>
                <td className="px-3 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Gastos de la gira (fuera de las fechas)</h3>
          {data.canEdit && (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="cursor-pointer">
              <Plus className="h-4 w-4" /> Gasto
            </Button>
          )}
        </div>
        {budget.costItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay gastos registrados.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {budget.costItems.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {shortDate(c.spentOn)} · {c.budgetLineId ? lineLabel.get(c.budgetLineId) : "Sin partida"}
                    {c.responsable ? ` · ${c.responsable}` : ""} · {c.pagado ? "Pagado" : "Pendiente"}
                  </p>
                </div>
                <span className="tabular-nums">{formatCurrency(c.amount)}</span>
                {data.canEdit && (
                  <Button size="icon" variant="ghost" onClick={() => removeCost(c.id)} className="cursor-pointer" title="Eliminar">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {adding && <AddTourCostDialog tourId={data.tour.id} lines={budget.lines} onClose={() => setAdding(false)} onSaved={onChanged} />}
    </div>
  );
}
