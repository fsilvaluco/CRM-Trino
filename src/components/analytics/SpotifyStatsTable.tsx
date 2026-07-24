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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import type { SpotifyStatsSnapshot } from "@/types/analytics";

const NUM = new Intl.NumberFormat("es-CL");

interface SpotifyStatsTableProps {
  snapshots: SpotifyStatsSnapshot[];
  onEdit: (snapshot: SpotifyStatsSnapshot) => void;
  onDeleted: () => void;
}

function fmt(n: number | null): string {
  return n != null ? NUM.format(n) : "—";
}

export function SpotifyStatsTable({ snapshots, onEdit, onDeleted }: SpotifyStatsTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (snapshot: SpotifyStatsSnapshot) => {
    if (!confirm("¿Eliminar este registro? También se quita del gráfico de seguidores si aportaba un punto ahí.")) {
      return;
    }
    setDeletingId(snapshot.id);
    try {
      const res = await fetch(`/api/analytics/spotify/${snapshot.id}`, { method: "DELETE" });
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
        Sin estadísticas registradas todavía — sube un pantallazo o carga los datos a mano.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Período</TableHead>
            <TableHead className="text-right">Oyentes</TableHead>
            <TableHead className="text-right">Oyentes activos</TableHead>
            <TableHead className="text-right">Reproducciones</TableHead>
            <TableHead className="text-right">Guardados</TableHead>
            <TableHead className="text-right">A playlist</TableHead>
            <TableHead className="text-right">Seguidores</TableHead>
            <TableHead>Fuente</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {snapshots.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium whitespace-nowrap">
                {format(new Date(`${s.periodStart}T00:00:00`), "d MMM", { locale: es })} –{" "}
                {format(new Date(`${s.periodEnd}T00:00:00`), "d MMM yyyy", { locale: es })}
              </TableCell>
              <TableCell className="text-right">{fmt(s.listeners)}</TableCell>
              <TableCell className="text-right">{fmt(s.monthlyActiveListeners)}</TableCell>
              <TableCell className="text-right">{fmt(s.streams)}</TableCell>
              <TableCell className="text-right">{fmt(s.saves)}</TableCell>
              <TableCell className="text-right">{fmt(s.playlistAdds)}</TableCell>
              <TableCell className="text-right">{fmt(s.followers)}</TableCell>
              <TableCell>
                <Badge variant={s.source === "screenshot" ? "default" : "secondary"}>
                  {s.source === "screenshot" ? "Pantallazo" : "Manual"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 justify-end">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(s)}
                    disabled={deletingId === s.id}
                  >
                    {deletingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
