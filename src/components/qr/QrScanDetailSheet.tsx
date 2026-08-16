"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ScanLine, Loader2 } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import type { QrCodeItem } from "./QrFormDialog";

function formatScanTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return `Hoy, ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `Ayer, ${format(d, "HH:mm")}`;
  return format(d, "d MMM yyyy, HH:mm", { locale: es });
}

// Componente separado y remontado por `key={item.id}` desde afuera -- así
// cada QR arranca su propio estado en null (loading) sin tener que resetear
// a mano dentro del efecto cuando cambia el item.
function QrScanDetailContent({ itemId }: { itemId: string }) {
  const [scans, setScans] = useState<string[] | null>(null);

  useEffect(() => {
    fetch(`/api/qr/${itemId}/scans`)
      .then((r) => r.json())
      .then((d) => setScans(Array.isArray(d.scans) ? d.scans : []))
      .catch(() => setScans([]));
  }, [itemId]);

  // Si toda la actividad cae en un solo día (ej. un pico de 60 escaneos en
  // una hora), agrupar por día deja UNA sola barra -- inútil para ver
  // cuándo hubo más actividad. En ese caso se agrupa por hora en vez de
  // por día.
  const { chartData, bucket } = useMemo(() => {
    if (!scans || scans.length === 0) return { chartData: [], bucket: "day" as const };

    const distinctDays = new Set(scans.map((iso) => format(new Date(iso), "yyyy-MM-dd")));
    const useHourly = distinctDays.size <= 1;

    const byBucket = new Map<string, { label: string; count: number; sortKey: string }>();
    for (const iso of scans) {
      const d = new Date(iso);
      const sortKey = useHourly ? format(d, "yyyy-MM-dd'T'HH") : format(d, "yyyy-MM-dd");
      const label = useHourly ? format(d, "HH:00") : format(d, "d MMM", { locale: es });
      const existing = byBucket.get(sortKey);
      if (existing) existing.count += 1;
      else byBucket.set(sortKey, { label, count: 1, sortKey });
    }
    return {
      chartData: [...byBucket.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
      bucket: useHourly ? ("hour" as const) : ("day" as const),
    };
  }, [scans]);

  if (scans === null) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (scans.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Todavía no tiene escaneos registrados.
      </p>
    );
  }

  return (
    <>
      {scans.length > 1 && chartData.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-3">
            {bucket === "hour" ? "Escaneos por hora" : "Escaneos por día"}
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }}
                labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                itemStyle={{ color: "#0f172a" }}
                formatter={(v) => [v, "Escaneos"]}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          {scans.length} escaneo{scans.length === 1 ? "" : "s"} en total
        </p>
        <div className="space-y-1 text-sm">
          {scans.map((iso, i) => (
            <div key={`${iso}-${i}`} className="flex items-center justify-between border-b py-1.5 last:border-0">
              <span>{formatScanTime(iso)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// Actividad de escaneos de un QR: grafico de barras por dia + log crudo con
// fecha/hora exacta de cada escaneo, mas reciente primero.
export function QrScanDetailSheet({ item, onClose }: { item: QrCodeItem | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(item)} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ScanLine className="h-4 w-4" />
            {item?.label}
          </SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-4 space-y-6 overflow-y-auto flex-1">
          {item && <QrScanDetailContent key={item.id} itemId={item.id} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
