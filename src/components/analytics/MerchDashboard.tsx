"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Package, ShoppingBag, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ShopifyProduct, ShopifySalesMonth } from "@/types/analytics";

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const NUM = new Intl.NumberFormat("es-CL");

interface MerchDashboardProps {
  products: ShopifyProduct[];
  salesByMonth: ShopifySalesMonth[];
}

export function MerchDashboard({ products, salesByMonth }: MerchDashboardProps) {
  const availableCount = products.filter((p) => p.available).length;
  const totalInventory = products.reduce((sum, p) => sum + p.inventoryQuantity, 0);

  const currentMonthKey = format(new Date(), "yyyy-MM-01");
  const currentMonth = salesByMonth.find((m) => m.month === currentMonthKey);

  const chartData = useMemo(
    () =>
      salesByMonth.map((m) => ({
        label: format(new Date(`${m.month}T00:00:00`), "MMM yy", { locale: es }),
        ventas: m.totalSales / 100,
        unidades: m.unitsSold,
      })),
    [salesByMonth]
  );

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
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

      {/* Ventas por mes */}
      {chartData.length > 0 ? (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground mb-4">Ventas de merch por mes (CLP)</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => CLP.format(v)} width={90} />
              <Tooltip
                formatter={(v, name) =>
                  name === "ventas" ? [CLP.format(Number(v ?? 0)), "Ventas"] : [NUM.format(Number(v ?? 0)), "Unidades"]
                }
              />
              <Bar dataKey="ventas" name="ventas" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShoppingBag className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Sin ventas sincronizadas todavía</p>
        </div>
      )}

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
              {products
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
