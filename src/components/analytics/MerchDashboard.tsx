"use client";

import { useMemo, useState, Fragment } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Package, ShoppingBag, TrendingUp, CalendarRange, ChevronRight, ArrowUpDown } from "lucide-react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ShopifyProduct, ShopifySalesMonth, ShopifyOrder } from "@/types/analytics";

const CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const NUM = new Intl.NumberFormat("es-CL");

// El total que trae Shopify (m.ventas) es el precio de venta, que en Chile
// ya incluye IVA -- no es un cargo aparte. Para desglosar Neto/IVA hay que
// "sacar" el IVA del bruto, no sumarlo: neto = bruto / 1.19.
const IVA_RATE = 0.19;

// Comisión de Transbank por venta con tarjeta -- tasa fija asumida (no viene
// de Shopify, es un costo externo). Si cambia el % que cobra TBK, ajustar
// acá. Mismo criterio que la hoja de cálculo del usuario: se cobra sobre el
// bruto, antes de sacar el IVA.
const TBK_COMMISSION_RATE = 0.045;

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

interface MerchDashboardProps {
  products: ShopifyProduct[];
  salesByMonth: ShopifySalesMonth[];
  projectId?: string;
}

export function MerchDashboard({ products, salesByMonth, projectId }: MerchDashboardProps) {
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

  // ── Catálogo: filtro de estado, orden por columna, expandir variantes ──
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "unavailable">("all");
  type SortKey = "title" | "available" | "cost" | "inventoryQuantity" | "price" | "totalValue";
  const [sortKey, setSortKey] = useState<SortKey>("available");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpandedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Histórico de ventas: expandir un mes muestra sus pedidos individuales,
  // pedidos on-demand (no se cargan todos los meses de una) y cacheados por
  // mes en este mismo state para no repetir el fetch al volver a expandir. ──
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [ordersByMonth, setOrdersByMonth] = useState<Record<string, ShopifyOrder[] | undefined>>({});
  const [loadingMonths, setLoadingMonths] = useState<Set<string>>(new Set());
  // Los items de un pedido solo se muestran si se hace click en ese pedido
  // puntual -- lo que importa a simple vista es el monto de cada pedido.
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());

  function toggleOrderExpanded(id: string) {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Número de pedido tal como lo entrega Shopify (ej. "#1292") -- se ordena
  // por el número, no por texto, para que #1289 no quede después de #1290.
  function orderNumberValue(orderNumber: string): number {
    return Number(orderNumber.replace(/[^\d]/g, "")) || 0;
  }

  async function toggleMonthExpanded(month: string) {
    const willExpand = !expandedMonths.has(month);
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (willExpand) next.add(month);
      else next.delete(month);
      return next;
    });
    if (!willExpand || !projectId || ordersByMonth[month] !== undefined) return;

    setLoadingMonths((prev) => new Set(prev).add(month));
    try {
      const [year, mon] = month.split("-").map(Number);
      const to = new Date(year, mon, 0).toISOString().slice(0, 10); // último día del mes
      const params = new URLSearchParams({ projectId, from: month, to });
      const res = await fetch(`/api/analytics/shopify/orders?${params.toString()}`);
      const data = res.ok ? await res.json() : { orders: [] };
      setOrdersByMonth((prev) => ({ ...prev, [month]: Array.isArray(data?.orders) ? data.orders : [] }));
    } finally {
      setLoadingMonths((prev) => {
        const next = new Set(prev);
        next.delete(month);
        return next;
      });
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visibleProducts = useMemo(() => {
    const filtered = products.filter((p) => {
      if (statusFilter === "available") return p.available;
      if (statusFilter === "unavailable") return !p.available;
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "available":
          return (Number(a.available) - Number(b.available)) * dir;
        case "cost":
          return ((a.cost ?? -1) - (b.cost ?? -1)) * dir;
        case "inventoryQuantity":
          return (a.inventoryQuantity - b.inventoryQuantity) * dir;
        case "price":
          return ((a.price ?? -1) - (b.price ?? -1)) * dir;
        case "totalValue":
          return (
            a.inventoryQuantity * (a.price ?? 0) - b.inventoryQuantity * (b.price ?? 0)
          ) * dir;
        default:
          return 0;
      }
    });
  }, [products, statusFilter, sortKey, sortDir]);

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
        month: `${selectedYear}-${String(idx + 1).padStart(2, "0")}-01`,
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
              contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }}
              labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                itemStyle={{ color: "#0f172a" }}
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
              {monthsWithSales.map((m) => {
                const canExpand = m.pedidos > 0 && !!projectId;
                const expanded = expandedMonths.has(m.month);
                const monthOrders = ordersByMonth[m.month];
                const isLoading = loadingMonths.has(m.month);
                return (
                  <Fragment key={m.label}>
                    <TableRow
                      className={canExpand ? "cursor-pointer" : undefined}
                      onClick={canExpand ? () => toggleMonthExpanded(m.month) : undefined}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {canExpand ? (
                            <ChevronRight
                              className={cn(
                                "h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0",
                                expanded && "rotate-90"
                              )}
                            />
                          ) : (
                            <span className="w-3.5 shrink-0" />
                          )}
                          {m.label} {selectedYear}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{NUM.format(m.pedidos)}</TableCell>
                      <TableCell className="text-right">{NUM.format(m.unidades)}</TableCell>
                      <TableCell className="text-right">{CLP.format(m.ventas)}</TableCell>
                    </TableRow>
                    {expanded && isLoading && (
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-3">
                          Cargando pedidos…
                        </TableCell>
                      </TableRow>
                    )}
                    {expanded &&
                      !isLoading &&
                      [...(monthOrders ?? [])]
                        .sort((a, b) => orderNumberValue(a.orderNumber) - orderNumberValue(b.orderNumber))
                        .map((order) => {
                          const orderExpanded = expandedOrderIds.has(order.id);
                          const units = order.items.reduce((sum, it) => sum + it.quantity, 0);
                          return (
                            <Fragment key={order.id}>
                              <TableRow className="bg-muted/30 cursor-pointer" onClick={() => toggleOrderExpanded(order.id)}>
                                <TableCell className="pl-9 text-sm">
                                  <div className="flex items-center gap-1.5">
                                    <ChevronRight
                                      className={cn(
                                        "h-3 w-3 text-muted-foreground transition-transform shrink-0",
                                        orderExpanded && "rotate-90"
                                      )}
                                    />
                                    <span className="font-medium">{order.orderNumber}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right text-sm text-muted-foreground">
                                  {format(new Date(`${order.day}T00:00:00`), "d MMM")}
                                </TableCell>
                                <TableCell className="text-right text-sm text-muted-foreground">
                                  {NUM.format(units)}
                                </TableCell>
                                <TableCell className="text-right text-sm font-medium">
                                  {CLP.format(order.totalSales / 100)}
                                </TableCell>
                              </TableRow>
                              {orderExpanded &&
                                order.items.map((it, idx) => (
                                  <TableRow key={idx} className="bg-muted/10">
                                    <TableCell colSpan={2} className="pl-16 text-xs text-muted-foreground">
                                      {it.title}
                                      {it.variant ? ` (${it.variant})` : ""}
                                    </TableCell>
                                    <TableCell className="text-right text-xs text-muted-foreground">
                                      {NUM.format(it.quantity)}
                                    </TableCell>
                                    <TableCell className="text-right text-xs text-muted-foreground">
                                      {CLP.format(it.totalSales / 100)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </Fragment>
                          );
                        })}
                    {expanded && !isLoading && monthOrders && monthOrders.length > 0 && (() => {
                      // Mismo orden que la hoja de cálculo: comisión TBK y
                      // IVA se descuentan del bruto (Ingresos), lo que queda
                      // es la Utilidad.
                      const comision = m.ventas * TBK_COMMISSION_RATE;
                      const iva = m.ventas * (IVA_RATE / (1 + IVA_RATE));
                      const utilidad = m.ventas - comision - iva;
                      return (
                        <Fragment>
                          <TableRow className="border-t">
                            <TableCell colSpan={3} className="pl-9 text-xs text-muted-foreground">
                              Comisión TBK (4,5%)
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {CLP.format(comision)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell colSpan={3} className="pl-9 text-xs text-muted-foreground">
                              IVA (19%)
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {CLP.format(iva)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell colSpan={3} className="pl-9 text-sm font-medium">
                              Utilidad
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {CLP.format(utilidad)}
                            </TableCell>
                          </TableRow>
                        </Fragment>
                      );
                    })()}
                  </Fragment>
                );
              })}
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
        <div className="p-4 pb-3 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs font-medium text-muted-foreground">Catálogo de la colección conectada</p>
          <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="h-8 w-44 text-xs cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="available">Solo disponibles</SelectItem>
              <SelectItem value="unavailable">Solo sin stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {visibleProducts.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Producto" active={sortKey === "title"} dir={sortDir} onClick={() => toggleSort("title")} />
                <SortableHead label="Estado" active={sortKey === "available"} dir={sortDir} onClick={() => toggleSort("available")} />
                <SortableHead
                  label="Costo"
                  align="right"
                  active={sortKey === "cost"}
                  dir={sortDir}
                  onClick={() => toggleSort("cost")}
                />
                <SortableHead
                  label="Inventario"
                  align="right"
                  active={sortKey === "inventoryQuantity"}
                  dir={sortDir}
                  onClick={() => toggleSort("inventoryQuantity")}
                />
                <SortableHead
                  label="Precio"
                  align="right"
                  active={sortKey === "price"}
                  dir={sortDir}
                  onClick={() => toggleSort("price")}
                />
                <SortableHead
                  label="Valor Inventario"
                  align="right"
                  active={sortKey === "totalValue"}
                  dir={sortDir}
                  onClick={() => toggleSort("totalValue")}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleProducts.map((p) => {
                const hasVariants = p.variants.length > 1;
                const expanded = expandedProductIds.has(p.id);
                return (
                  <Fragment key={p.id}>
                    <TableRow
                      className={hasVariants ? "cursor-pointer" : undefined}
                      onClick={hasVariants ? () => toggleExpanded(p.id) : undefined}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {hasVariants ? (
                            <ChevronRight
                              className={cn(
                                "h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0",
                                expanded && "rotate-90"
                              )}
                            />
                          ) : (
                            <span className="w-3.5 shrink-0" />
                          )}
                          {p.title}
                          {hasVariants && (
                            <span className="text-xs text-muted-foreground font-normal">
                              ({p.variants.length} variantes)
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.available ? "default" : "secondary"}>
                          {p.available ? "Disponible" : "Sin stock / inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{p.cost != null ? CLP.format(p.cost / 100) : "—"}</TableCell>
                      <TableCell className="text-right">{NUM.format(p.inventoryQuantity)}</TableCell>
                      <TableCell className="text-right">{p.price != null ? CLP.format(p.price / 100) : "—"}</TableCell>
                      <TableCell className="text-right font-medium">
                        {p.price != null ? CLP.format((p.inventoryQuantity * p.price) / 100) : "—"}
                      </TableCell>
                    </TableRow>
                    {hasVariants && expanded &&
                      p.variants.map((v) => (
                        <TableRow key={v.id} className="bg-muted/30">
                          <TableCell className="pl-9 text-sm text-muted-foreground">{v.title}</TableCell>
                          <TableCell>
                            <Badge variant={v.available ? "default" : "secondary"} className="opacity-80">
                              {v.available ? "Disponible" : "Sin stock"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {v.cost != null ? CLP.format(v.cost / 100) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {NUM.format(v.inventoryQuantity)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {v.price != null ? CLP.format(v.price / 100) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {v.price != null ? CLP.format((v.inventoryQuantity * v.price) / 100) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">
            {products.length === 0
              ? "Sin productos sincronizados todavía"
              : "Ningún producto coincide con el filtro seleccionado"}
          </p>
        )}
      </div>
    </div>
  );
}

function SortableHead({
  label,
  align,
  active,
  dir,
  onClick,
}: {
  label: string;
  align?: "right";
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 cursor-pointer select-none hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground font-medium" : "text-muted-foreground"
        )}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active && dir === "desc" && "rotate-180")} />
      </button>
    </TableHead>
  );
}
