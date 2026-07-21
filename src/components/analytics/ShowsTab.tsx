"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Plus, Music, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { Show } from "@/types/analytics";
import { useProject } from "@/lib/project-context";

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return CLP.format(cents / 100);
}

const showSchema = z.object({
  date: z.string().min(1, "La fecha es requerida"),
  venue: z.string().trim().min(1, "El venue es requerido"),
  city: z.string().trim().optional(),
  fee: z.string().optional(),
  ticket_income: z.string().optional(),
  expenses: z.string().optional(),
  notes: z.string().optional(),
});

type ShowFormData = z.infer<typeof showSchema>;

interface ShowsTabProps {
  shows: Show[];
  onRefresh: () => void;
}

export function ShowsTab({ shows, onRefresh }: ShowsTabProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { activeProject } = useProject();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ShowFormData>({ resolver: zodResolver(showSchema) });

  const onSubmit = async (data: ShowFormData) => {
    setSubmitting(true);
    try {
      if (!activeProject?.id) {
        toast.error("Selecciona un proyecto antes de registrar un show");
        return;
      }
      const body = {
        projectId: activeProject.id,
        date: data.date,
        venue: data.venue,
        city: data.city || null,
        fee: data.fee ? parseInt(data.fee, 10) * 100 : null,
        ticketIncome: data.ticket_income ? parseInt(data.ticket_income, 10) * 100 : null,
        expenses: data.expenses ? parseInt(data.expenses, 10) * 100 : null,
        notes: data.notes || null,
      };
      const res = await fetch("/api/analytics/shows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error("Error al registrar el show");
        return;
      }
      toast.success("Show registrado");
      reset();
      setSheetOpen(false);
      onRefresh();
    } finally {
      setSubmitting(false);
    }
  };

  const chartData = shows
    .slice()
    .reverse()
    .map((s) => ({
      venue: s.venue,
      utilidad: ((s.fee ?? 0) + (s.ticketIncome ?? 0) - (s.expenses ?? 0)) / 100,
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {shows.length} show{shows.length !== 1 ? "s" : ""} registrado{shows.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Registrar show
        </Button>
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground mb-4">Utilidad por show (CLP)</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="venue" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => CLP.format(v)} width={90} />
              <Tooltip formatter={(v) => [CLP.format(Number(v ?? 0)), "Utilidad"]} />
              <Bar dataKey="utilidad" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {/* Table */}
      {shows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Music className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Sin shows registrados</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Fecha</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Venue</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Ciudad</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Fee</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Entradas</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Gastos</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Utilidad</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Vibe</th>
              </tr>
            </thead>
            <tbody>
              {shows.map((show) => {
                const utilidad =
                  (show.fee ?? 0) + (show.ticketIncome ?? 0) - (show.expenses ?? 0);
                return (
                  <tr key={show.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 whitespace-nowrap">
                      {format(new Date(show.date), "d MMM yyyy", { locale: es })}
                    </td>
                    <td className="px-4 py-2 font-medium">{show.venue}</td>
                    <td className="px-4 py-2 text-muted-foreground">{show.city ?? "—"}</td>
                    <td className="px-4 py-2 text-right">{formatCents(show.fee)}</td>
                    <td className="px-4 py-2 text-right">{formatCents(show.ticketIncome)}</td>
                    <td className="px-4 py-2 text-right">{formatCents(show.expenses)}</td>
                    <td
                      className={`px-4 py-2 text-right font-semibold ${
                        utilidad >= 0
                          ? "text-green-700 dark:text-green-400"
                          : "text-red-700 dark:text-red-400"
                      }`}
                    >
                      {CLP.format(utilidad / 100)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {show.avgVibe != null ? show.avgVibe.toFixed(1) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sheet form */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Registrar show</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 px-4 py-2 overflow-y-auto flex-1">
            <div className="space-y-1.5">
              <Label htmlFor="date">Fecha *</Label>
              <Input id="date" type="date" {...register("date")} />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="venue">Venue *</Label>
              <Input id="venue" placeholder="Club de Jazz" {...register("venue")} />
              {errors.venue && <p className="text-xs text-destructive">{errors.venue.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Ciudad</Label>
              <Input id="city" placeholder="Santiago" {...register("city")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fee">Fee (CLP)</Label>
              <Input id="fee" type="number" min="0" placeholder="0" {...register("fee")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ticket_income">Ingresos por entradas (CLP)</Label>
              <Input id="ticket_income" type="number" min="0" placeholder="0" {...register("ticket_income")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expenses">Gastos (CLP)</Label>
              <Input id="expenses" type="number" min="0" placeholder="0" {...register("expenses")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" placeholder="Observaciones del show..." {...register("notes")} />
            </div>
            <SheetFooter>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Guardar show
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
