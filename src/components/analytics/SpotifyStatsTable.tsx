"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { SpotifyStatsSnapshot } from "@/types/analytics";

const NUM = new Intl.NumberFormat("es-CL");

interface SpotifyStatsTableProps {
  snapshots: SpotifyStatsSnapshot[];
}

function fmt(n: number | null): string {
  return n != null ? NUM.format(n) : "—";
}

export function SpotifyStatsTable({ snapshots }: SpotifyStatsTableProps) {
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
