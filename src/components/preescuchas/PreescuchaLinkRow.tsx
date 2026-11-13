"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Ban, ChevronDown, ChevronRight, Copy, RotateCcw, Trash2 } from "lucide-react";

export interface LinkRowTrack {
  id: string;
  title: string;
}

interface PreescuchaLinkRowProps {
  name: string;
  /** Texto bajo el nombre para el enlace general ("Para quien no tiene enlace propio"). */
  subtitle?: string;
  viewCount: number;
  playCount: number;
  downloadCount: number;
  lastActivityAt?: string | null;
  trackPlays: Record<string, number>;
  tracks: LinkRowTrack[];
  revoked?: boolean;
  busy?: boolean;
  /** Sin onCopy el enlace no se puede copiar (preescucha vencida o enlace revocado). */
  onCopy?: () => void;
  onToggleRevoked?: () => void;
  onDelete?: () => void;
}

// Una fila del panel de enlaces: la persona, su actividad resumida y, al
// desplegar, cuantas veces escucho cada cancion.
export function PreescuchaLinkRow(props: PreescuchaLinkRowProps) {
  const { name, subtitle, viewCount, playCount, downloadCount, lastActivityAt, trackPlays, tracks, revoked, busy } = props;
  const [open, setOpen] = useState(false);
  const listened = tracks.filter((t) => (trackPlays[t.id] ?? 0) > 0).length;
  const opened = viewCount > 0 || playCount > 0;

  const summary = !opened
    ? "Aún no lo abre"
    : [
        `${viewCount} ${viewCount === 1 ? "visita" : "visitas"}`,
        `escuchó ${listened} de ${tracks.length} ${tracks.length === 1 ? "canción" : "canciones"}`,
        downloadCount > 0 ? `${downloadCount} ${downloadCount === 1 ? "descarga" : "descargas"}` : "",
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <li className={`rounded-lg border ${revoked ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-1 p-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex-1 min-w-0 flex items-start gap-1.5 text-left cursor-pointer"
        >
          {open ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />}
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate">{name}</span>
              {revoked && <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">Revocado</Badge>}
              {!revoked && opened && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden />}
            </span>
            <span className="block text-xs text-muted-foreground">
              {subtitle ? `${subtitle} · ` : ""}
              {summary}
              {lastActivityAt ? ` · ${formatDistanceToNow(new Date(lastActivityAt), { locale: es, addSuffix: true })}` : ""}
            </span>
          </span>
        </button>

        {props.onCopy && (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 cursor-pointer" onClick={props.onCopy} title="Copiar enlace" aria-label={`Copiar enlace de ${name}`}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        )}
        {props.onToggleRevoked && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 cursor-pointer"
            disabled={busy}
            onClick={props.onToggleRevoked}
            title={revoked ? "Volver a activar" : "Revocar (deja de funcionar)"}
            aria-label={revoked ? `Volver a activar el enlace de ${name}` : `Revocar el enlace de ${name}`}
          >
            {revoked ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
          </Button>
        )}
        {props.onDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 cursor-pointer text-muted-foreground hover:text-destructive"
            disabled={busy}
            onClick={props.onDelete}
            title="Eliminar enlace"
            aria-label={`Eliminar el enlace de ${name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {open && (
        <ol className="border-t px-3 py-2 space-y-0.5 text-xs">
          {tracks.map((t, i) => {
            const plays = trackPlays[t.id] ?? 0;
            return (
              <li key={t.id} className={`flex items-center gap-2 ${plays === 0 ? "text-muted-foreground" : ""}`}>
                <span className="w-4 text-right tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="flex-1 truncate">{t.title}</span>
                <span className="tabular-nums">{plays === 0 ? "sin escuchar" : plays === 1 ? "1 vez" : `${plays} veces`}</span>
              </li>
            );
          })}
        </ol>
      )}
    </li>
  );
}
