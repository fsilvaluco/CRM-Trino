"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowDown, ArrowUp, CheckCircle2, Loader2, Trash2, TriangleAlert, Upload } from "lucide-react";
import { formatBytes, formatDuration } from "@/lib/preescucha-format";

export interface TrackDraft {
  /** Clave local estable para React (no es el id de la base). */
  key: string;
  /** Presente si la cancion ya existe en la preescucha que se esta editando. */
  id?: string;
  title: string;
  durationSeconds: number | null;
  sizeBytes: number | null;
  /** MP3 listo para subir (solo canciones nuevas). */
  blob?: Blob;
  /** Ruta en el bucket una vez subido -- evita resubir si el guardado se reintenta. */
  filePath?: string;
  status: "saved" | "converting" | "ready" | "error";
  /** Avance de la conversion a MP3, 0 a 1. */
  progress: number;
  converted: boolean;
  error?: string;
}

interface PreescuchaTracksFieldProps {
  tracks: TrackDraft[];
  disabled: boolean;
  onAddFiles: (files: File[]) => void;
  onChange: (tracks: TrackDraft[]) => void;
}

// Lista editable de canciones del formulario de Preescuchas: agregar
// archivos, renombrar, reordenar y quitar. La conversion a MP3 la maneja el
// dialogo; aqui solo se muestra su avance.
export function PreescuchaTracksField({ tracks, disabled, onAddFiles, onChange }: PreescuchaTracksFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= tracks.length) return;
    const next = tracks.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Canciones</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="cursor-pointer"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          Agregar archivos
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".mp3,.wav,.aif,.aiff,.flac,audio/*"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length > 0) onAddFiles(files);
          }}
        />
      </div>

      {tracks.length === 0 ? (
        <p className="text-xs text-muted-foreground border border-dashed rounded-lg p-4 text-center">
          Elige los archivos del lanzamiento (puedes seleccionar varios a la vez). Acepta MP3 y WAV: los WAV se
          convierten a MP3 en tu computador antes de subirse, así no ocupan espacio de más.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {tracks.map((track, index) => (
            <li key={track.key} className="rounded-lg border p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-5 text-center text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                <Input
                  value={track.title}
                  onChange={(e) => onChange(tracks.map((t) => (t.key === track.key ? { ...t, title: e.target.value } : t)))}
                  placeholder="Título de la canción"
                  aria-label={`Título de la canción ${index + 1}`}
                  className="h-8 flex-1"
                  disabled={disabled}
                />
                <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 cursor-pointer" disabled={disabled || index === 0} onClick={() => move(index, -1)} title="Subir">
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 cursor-pointer" disabled={disabled || index === tracks.length - 1} onClick={() => move(index, 1)} title="Bajar">
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 cursor-pointer text-muted-foreground hover:text-destructive"
                  disabled={disabled || track.status === "converting"}
                  onClick={() => onChange(tracks.filter((t) => t.key !== track.key))}
                  title="Quitar"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="pl-6 text-xs text-muted-foreground flex items-center gap-1.5">
                {track.status === "converting" && (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Convirtiendo a MP3… {Math.round(track.progress * 100)}%
                  </>
                )}
                {track.status === "error" && (
                  <span className="text-destructive flex items-center gap-1.5">
                    <TriangleAlert className="h-3 w-3" />
                    {track.error ?? "No se pudo procesar"} Quítala e intenta de nuevo.
                  </span>
                )}
                {(track.status === "ready" || track.status === "saved") && (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    {[
                      formatDuration(track.durationSeconds),
                      formatBytes(track.sizeBytes),
                      track.status === "saved" ? "ya subida" : track.converted ? "convertida a MP3" : "MP3",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
