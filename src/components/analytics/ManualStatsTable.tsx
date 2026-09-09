"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import type { ManualPlatformStats, ManualStatsPlatform } from "@/types/analytics";
import { MANUAL_PLATFORM_METRIC_KEYS } from "@/lib/dossier-data-sources";

const NUM = new Intl.NumberFormat("es-CL");

interface ManualStatsTableProps {
  platform: ManualStatsPlatform;
  snapshots: ManualPlatformStats[];
  onDeleted: () => void;
}

function fmt(v: number | undefined, kind: "number" | "percent" | "decimal"): string {
  if (v == null) return "—";
  if (kind === "percent") return `${v}%`;
  return NUM.format(v);
}

// Tabla de estadísticas manuales de TikTok/YouTube (migración 091) -- a
// diferencia de Spotify, las métricas son key/value libre (no columnas
// fijas), así que las columnas se arman desde MANUAL_PLATFORM_METRIC_KEYS.
// Mismo patrón de borrado que SpotifyStatsTable.
export function ManualStatsTable({ platform, snapshots, onDeleted }: ManualStatsTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fields = MANUAL_PLATFORM_METRIC_KEYS[platform];

  const handleDelete = async (snapshot: ManualPlatformStats) => {
    if (!confirm("¿Eliminar este registro? También se quita del gráfico de seguidores si aportaba un punto ahí.")) {
      return;
    }
    setDeletingId(snapshot.id);
    try {
      const res = await fetch(`/api/analytics/manual-stats/${snapshot.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Registro eliminado");
        onDeleted();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Error al eliminar");
      }
    } finally {
      setDeletingId(null);
    }
  };

  if (snapshots.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Sin estadísticas registradas todavía — usa &quot;Registrar estadísticas&quot; para cargar los datos a mano.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">Fecha</TableHead>
            {fields.map((f) => (
              <TableHead key={f.key} className="text-right whitespace-nowrap">
                {f.label}
              </TableHead>
            ))}
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {snapshots.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium whitespace-nowrap">
                {format(new Date(`${s.periodEnd}T00:00:00`), "d MMM yyyy", { locale: es })}
              </TableCell>
              {fields.map((f) => (
                <TableCell key={f.key} className="text-right whitespace-nowrap">
                  {fmt(s.metrics[f.key], f.format)}
                </TableCell>
              ))}
              <TableCell>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(s)}
                  disabled={deletingId === s.id}
                >
                  {deletingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
