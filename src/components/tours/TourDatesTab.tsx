"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddTourDateDialog } from "@/components/tours/AddTourDateDialog";
import { PACE_CLASS, PACE_LABEL, SHOW_STATUS_LABEL, daysAgo, shortDate } from "@/components/tours/labels";
import type { TourDate, TourDetail } from "@/types/tours";

async function patchDate(tourId: string, showId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/giras/${tourId}/fechas/${showId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");
}

function Progress({ d }: { d: TourDate }) {
  if (!d.target) return <span className="text-muted-foreground">—</span>;
  const pct = Math.min(100, Math.round((d.sold * 100) / d.target));
  const expectedPct = d.expectedSold && d.target ? Math.min(100, Math.round((d.expectedSold * 100) / d.target)) : null;
  return (
    <div className="w-28">
      <div className="relative h-1.5 rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct}%` }} />
        {expectedPct !== null && expectedPct > 0 && (
          <div className="absolute -top-0.5 h-2.5 w-0.5 bg-foreground/60" style={{ left: `${expectedPct}%` }} title={`Esperado a hoy: ${d.expectedSold}`} />
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
        {d.sold}/{d.target} meta
      </p>
    </div>
  );
}

export function TourDatesTab({ data, onChanged }: { data: TourDetail; onChanged: () => void }) {
  const { tour, legs, dates, canEdit } = data;
  const [adding, setAdding] = useState(false);

  async function save(showId: string, body: Record<string, unknown>) {
    try {
      await patchDate(tour.id, showId, body);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const groups = [
    ...legs.map((l) => ({ key: l.id, label: `${l.name} · ${shortDate(l.startDate)} – ${shortDate(l.endDate)}`, rows: dates.filter((d) => d.tourLegId === l.id) })),
    { key: "sin-tramo", label: "Sin tramo", rows: dates.filter((d) => !d.tourLegId) },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          La venta se actualiza en cada evento (tiers / pantallazo de la ticketera). La raya vertical marca lo esperado a hoy según la curva de venta.
        </p>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="cursor-pointer">
            <Plus className="h-4 w-4" /> Agregar fecha
          </Button>
        )}
      </div>

      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h3 className="text-sm font-semibold">{g.label}</h3>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Ciudad · venue</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Venta</th>
                  <th className="px-3 py-2 font-medium">Proyección</th>
                  <th className="px-3 py-2 font-medium">Ritmo</th>
                  <th className="px-3 py-2 font-medium">Inicio venta</th>
                  <th className="px-3 py-2 font-medium">Actualizada</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {g.rows.map((d) => {
                  const ago = daysAgo(d.ticketsUpdatedAt);
                  return (
                    <tr key={d.showId} className={`border-t ${d.showStatus === "cancelado" ? "opacity-50" : ""}`}>
                      <td className="px-3 py-2 whitespace-nowrap">{shortDate(d.date)}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{d.city}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.venue}
                          {d.capacity ? ` · aforo ${d.capacity}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        {canEdit ? (
                          <Select value={d.showStatus} onValueChange={(v) => v && v !== d.showStatus && save(d.showId, { status: v })}>
                            <SelectTrigger className="h-8 w-40 cursor-pointer text-xs">
                              <SelectValue>{SHOW_STATUS_LABEL[d.showStatus]}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {["confirmado", "cotizando", "cancelado", "realizado"].map((s) => (
                                <SelectItem key={s} value={s}>{SHOW_STATUS_LABEL[s]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          SHOW_STATUS_LABEL[d.showStatus]
                        )}
                      </td>
                      <td className="px-3 py-2"><Progress d={d} /></td>
                      <td className="px-3 py-2 tabular-nums">
                        {d.projectedPct !== null && !["no_iniciada", "sin_datos", "caida"].includes(d.paceStatus) ? `${d.projectedPct}%` : "—"}
                        {d.pace7d !== null && d.pace7d > 0 && <p className="text-[11px] text-muted-foreground">{d.pace7d}/día últimos 7</p>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs whitespace-nowrap ${PACE_CLASS[d.paceStatus]}`}>{PACE_LABEL[d.paceStatus]}</span>
                      </td>
                      <td className="px-3 py-2">
                        {canEdit ? (
                          <Input
                            type="date"
                            className="h-8 w-36 text-xs"
                            defaultValue={d.salesStartAssumed ? "" : d.salesStart}
                            placeholder={d.salesStart}
                            onBlur={(e) => {
                              const v = e.target.value;
                              if (v !== (d.salesStartAssumed ? "" : d.salesStart)) save(d.showId, { salesStartDate: v || null });
                            }}
                          />
                        ) : (
                          shortDate(d.salesStart)
                        )}
                        {d.salesStartAssumed && <p className="text-[11px] text-muted-foreground">Supuesto: {shortDate(d.salesStart)}</p>}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {ago === null ? <span className="text-muted-foreground">Nunca</span> : ago === 0 ? "Hoy" : `Hace ${ago} d`}
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/eventos/${d.showId}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          Evento <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {adding && <AddTourDateDialog tourId={tour.id} legs={legs} onClose={() => setAdding(false)} onAdded={onChanged} />}
    </div>
  );
}
