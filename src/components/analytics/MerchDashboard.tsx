"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Package, ShoppingBag, TrendingUp, CalendarRange } from "lucide-react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ShopifyProduct, ShopifySalesMonth } from "@/types/analytics";

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const NUM = new Intl.NumberFormat("es-CL");

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

interface MerchDashboardProps {
  products: ShopifyProduct[];
  salesByMonth: ShopifySalesMonth[];
}

export function MerchDashboard({ products, salesByMonth }: MerchDashboardProps) {
  const availableCount = products.filter((p) => p.available).length;
  const totalInventory = products.reduce((sum, p) => sum + p.inventoryQuantity, 0);

  const currentMonthKey = format(new Date(), "yyyy-MM-01");
  const currentMonth = salesByMonth.find((m) => m.month === currentMonthKey);

  // Años con datos, de más reciente a más antiguo. Siempre se incluye el año
  // en curso aunque todavía no tenga ventas, para que el selector no
  // aparezca vacío al empezar el año.
  const years = useMemo(() => {
    const set = new Set<number>(salesByMonth.map((m) => Number(m.month.slice(0, 4))));
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [salesByMonth]);

  const [selectedYear, setSelectedYear] = useState<number>(years[0]);

  // Siempre 12 barras: los meses sin ventas se muestran en cero en vez de
  // desaparecer, para que el año se lea completo y se noten los huecos.
  const chartData = useMemo(() => {
    const byMonth = new Map(
      salesByMonth
        .filter((m) => Number(m.month.slice(0, 4)) === selectedYear)
        .map((m) => [Number(m.month.slice(5, 7)), m])
    );
    return MONTH_LABELS.map((label, idx) => {
      const found = byMonth.get(idx + 1);
      return {
        label,
        ventas: found ? found.totalSales / 100 : 0,
        unidades: found?.unitsSold ?? 0,
        pedidos: found?.ordersCount ?? 0,
      };
    });
  }, [salesByMonth, selectedYear]);

  const yearTotals = useMemo(
    () =>
      chartData.reduce(
        (acc, m) => ({
          ventas: acc.ventas + m.ventas,
          unidades: acc.unidades + m.unidades,
          pedidos: acc.pedidos + m.pedidos,
        }),
        { ventas: 0, unidades: 0, pedidos: 0 }
      ),
    [chartData]
  );

  const monthsWithSales = chartData.filter((m) => m.ventas > 0 || m.unidades > 0);
  const hasAnySales = salesByMonth.length > 0;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <ShoppingBag className="h-3 w-3" /> Productos disponibles
          </p>
          <p className="text-lg font-bold">
            {availableCount} <span className="text-xs font-normal text-muted-foreground">/ {products.length}</span>
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Package className="h-3 w-3" /> Inventario total
          </p>
          <p className="text-lg font-bold">{NUM.format(totalInventory)} unidades</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Ventas este mes
          </p>
          <p className="text-lg font-bold">{currentMonth ? CLP.format(currentMonth.totalSales / 100) : "—"}</p>
        </div>
      </div>

      {/* Histórico de ventas */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <CalendarRange className="h-3.5 w-3.5" /> Histórico de ventas
          </p>
          <div className="flex items-center gap-1">
            {years.map((year) => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  year === selectedYear
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {year}
              </button>
            ))}
          </div>
        </div>

        {/* Totales del año seleccionado */}
        <div className="grid grid-cols-3 gap-4 border-y py-3">
          <div>
            <p className="text-[11px] text-muted-foreground">Total {selectedYear}</p>
            <p className="text-base font-bold">{CLP.format(yearTotals.ventas)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Unidades</p>
            <p className="text-base font-bold">{NUM.format(yearTotals.unidades)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Pedidos</p>
            <p className="text-base font-bold">{NUM.format(yearTotals.pedidos)}</p>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => CLP.format(v)} width={90} />
            <Tooltip
              formatter={(v, name) => {
                if (name === "ventas") return [CLP.format(Number(v ?? 0)), "Ventas"];
                return [NUM.format(Number(v ?? 0)), name === "unidades" ? "Unidades" : "Pedidos"];
              }}
            />
            <Bar dataKey="ventas" name="ventas" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))" />
          </BarChart>
        </ResponsiveContainer>

        {/* Detalle mes a mes — solo los meses que tuvieron movimiento */}
        {monthsWithSales.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                <TableHead className="text-right">Ventas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthsWithSales.map((m) => (
                <TableRow key={m.label}>
                  <TableCell className="font-medium">
                    {m.label} {selectedYear}
                  </TableCell>
                  <TableCell className="text-right">{NUM.format(m.pedidos)}</TableCell>
                  <TableCell className="text-right">{NUM.format(m.unidades)}</TableCell>
                  <TableCell className="text-right">{CLP.format(m.ventas)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {hasAnySales
              ? `Sin ventas registradas en ${selectedYear}`
              : "Sin ventas sincronizadas todavía. Shopify solo entrega los últimos 60 días de pedidos hasta que se apruebe el permiso de histórico completo."}
          </p>
        )}
      </div>

      {/* Catálogo / inventario */}
      <div className="rounded-xl border bg-card">
        <div className="p-4 pb-0">
          <p className="text-xs font-medium text-muted-foreground">Catálogo de la colección conectada</p>
        </div>
        {products.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Inventario</TableHead>
                <TableHead className="text-right">Precio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...products]
                .sort((a, b) => a.title.localeCompare(b.title))
                .map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.title}</TableCell>
                    <TableCell>
                      <Badge variant={p.available ? "default" : "secondary"}>
                        {p.available ? "Disponible" : "Sin stock / inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{NUM.format(p.inventoryQuantity)}</TableCell>
                    <TableCell className="text-right">{p.price != null ? CLP.format(p.price / 100) : "—"}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Sin productos sincronizados todavía</p>
        )}
      </div>
    </div>
  );
}
