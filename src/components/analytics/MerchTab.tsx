"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Plus, ShoppingBag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { MerchSnapshot } from "@/types/analytics";
import { useProject } from "@/lib/project-context";

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const merchSchema = z.object({
  period_start: z.string().min(1, "La fecha de inicio es requerida"),
  period_end: z.string().min(1, "La fecha de fin es requerida"),
  total_sales: z.string().optional(),
  units_sold: z.string().optional(),
});

type MerchFormData = z.infer<typeof merchSchema>;

interface MerchTabProps {
  snapshots: MerchSnapshot[];
  onRefresh: () => void;
}

export function MerchTab({ snapshots, onRefresh }: MerchTabProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { activeProject } = useProject();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MerchFormData>({ resolver: zodResolver(merchSchema) });

  const onSubmit = async (data: MerchFormData) => {
    setSubmitting(true);
    try {
      if (!activeProject?.id) {
        toast.error("Selecciona un proyecto antes de registrar");
        return;
      }
      const body = {
        projectId: activeProject.id,
        periodStart: data.period_start,
        periodEnd: data.period_end,
        totalSales: data.total_sales ? parseInt(data.total_sales, 10) * 100 : null,
        unitsSold: data.units_sold ? parseInt(data.units_sold, 10) : null,
      };
      const res = await fetch("/api/analytics/merch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error("Error al registrar ventas");
        return;
      }
      toast.success("Ventas registradas");
      reset();
      setSheetOpen(false);
      onRefresh();
    } finally {
      setSubmitting(false);
    }
  };

  const chartData = [...snapshots]
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .map((s) => ({
      label: format(new Date(s.periodStart), "d MMM", { locale: es }),
      ventas: s.totalSales != null ? s.totalSales / 100 : 0,
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {snapshots.length} período{snapshots.length !== 1 ? "s" : ""} registrado{snapshots.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Registrar ventas
        </Button>
      </div>

      {chartData.length > 0 ? (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground mb-4">Ventas de merch por período (CLP)</p>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="merchantGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => CLP.format(v)}
                width={90}
              />
              <Tooltip formatter={(v) => [CLP.format(Number(v ?? 0)), "Ventas"]} />
              <Area
                type="monotone"
                dataKey="ventas"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#merchantGradient)"
                name="Ventas"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShoppingBag className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Sin datos de merch registrados</p>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Registrar ventas de merch</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 px-4 py-2 overflow-y-auto flex-1">
            <div className="space-y-1.5">
              <Label htmlFor="period_start">Inicio del período *</Label>
              <Input id="period_start" type="date" {...register("period_start")} />
              {errors.period_start && (
                <p className="text-xs text-destructive">{errors.period_start.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="period_end">Fin del período *</Label>
              <Input id="period_end" type="date" {...register("period_end")} />
              {errors.period_end && (
                <p className="text-xs text-destructive">{errors.period_end.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="total_sales">Ventas totales (CLP)</Label>
              <Input
                id="total_sales"
                type="number"
                min="0"
                placeholder="0"
                {...register("total_sales")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="units_sold">Unidades vendidas</Label>
              <Input
                id="units_sold"
                type="number"
                min="0"
                placeholder="0"
                {...register("units_sold")}
              />
            </div>
            <SheetFooter>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Guardar ventas
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
