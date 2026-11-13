"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { formatDuration } from "@/lib/preescucha-format";

export interface PublicTrack {
  id: string;
  title: string;
  durationSeconds: number | null;
}

interface PublicPlayerProps {
  slug: string;
  tracks: PublicTrack[];
  allowDownload: boolean;
}

// Reproductor de la pagina publica de una Preescucha. Un solo <audio>
// oculto con controles propios: lista de canciones, play/pausa, barra para
// adelantar y paso automatico a la siguiente. El audio se pide a
// /api/public/preescuchas/{slug}/audio/{id}, que redirige a una URL firmada.
export function PublicPlayer({ slug, tracks, allowDownload }: PublicPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  // Canciones ya contadas como "reproduccion" en esta visita (una vez c/u).
  const countedRef = useRef<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);

  const current = currentIndex !== null ? tracks[currentIndex] : null;
  const audioUrl = (trackId: string) => `/api/public/preescuchas/${slug}/audio/${trackId}`;

  function playIndex(index: number) {
    const audio = audioRef.current;
    const track = tracks[index];
    if (!audio || !track) return;
    setFailed(false);
    setCurrentIndex(index);
    setCurrentTime(0);
    setDuration(track.durationSeconds ?? 0);
    audio.src = audioUrl(track.id);
    void audio.play().catch(() => setPlaying(false));
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentIndex === null) {
      playIndex(0);
    } else if (audio.paused) {
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }

  function handlePlaying() {
    setPlaying(true);
    if (!current || countedRef.current.has(current.id)) return;
    countedRef.current.add(current.id);
    fetch(`/api/public/preescuchas/${slug}/play`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: current.id }),
      keepalive: true,
    }).catch(() => {});
  }

  function handleEnded() {
    if (currentIndex !== null && currentIndex < tracks.length - 1) {
      playIndex(currentIndex + 1);
    } else {
      setPlaying(false);
    }
  }

  // Titulo de la cancion en los controles del sistema (pantalla de bloqueo
  // del telefono, audifonos): la prensa suele escuchar desde el celular.
  useEffect(() => {
    if (!current || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: current.title });
  }, [current]);

  const total = duration || current?.durationSeconds || 0;

  return (
    <div className="space-y-4">
      <audio
        ref={audioRef}
        preload="none"
        onPlaying={handlePlaying}
        onPause={() => setPlaying(false)}
        onEnded={handleEnded}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
        }}
        onError={() => {
          setPlaying(false);
          if (currentIndex !== null) setFailed(true);
        }}
      />

      <div className="rounded-2xl bg-white/[0.06] p-4 space-y-3">
        <p className="text-sm font-medium truncate min-h-5" aria-live="polite">
          {current ? current.title : "Toca una canción para empezar"}
        </p>
        <div className="flex items-center gap-2 text-xs tabular-nums text-white/60">
          <span className="w-9 text-right">{formatDuration(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={total || 1}
            step={1}
            value={Math.min(currentTime, total || 1)}
            disabled={!current}
            onChange={(e) => {
              const audio = audioRef.current;
              if (!audio) return;
              audio.currentTime = Number(e.target.value);
              setCurrentTime(Number(e.target.value));
            }}
            aria-label="Posición de la canción"
            className="flex-1 h-1 accent-white cursor-pointer disabled:cursor-default disabled:opacity-40"
          />
          <span className="w-9">{formatDuration(total)}</span>
        </div>
        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={() => currentIndex !== null && currentIndex > 0 && playIndex(currentIndex - 1)}
            disabled={currentIndex === null || currentIndex === 0}
            aria-label="Canción anterior"
            className="p-2 text-white/80 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-default"
          >
            <SkipBack className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pausar" : "Reproducir"}
            className="h-14 w-14 rounded-full bg-white text-[#14162B] flex items-center justify-center hover:scale-105 transition-transform cursor-pointer"
          >
            {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 translate-x-0.5" />}
          </button>
          <button
            type="button"
            onClick={() => currentIndex !== null && currentIndex < tracks.length - 1 && playIndex(currentIndex + 1)}
            disabled={currentIndex === null || currentIndex >= tracks.length - 1}
            aria-label="Canción siguiente"
            className="p-2 text-white/80 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-default"
          >
            <SkipForward className="h-5 w-5" />
          </button>
        </div>
        {failed && (
          <p className="text-xs text-red-300 text-center">
            No se pudo reproducir esta canción. Recarga la página; si sigue fallando, es posible que el enlace haya vencido.
          </p>
        )}
      </div>

      <ol className="rounded-2xl bg-white/[0.06] divide-y divide-white/10 overflow-hidden">
        {tracks.map((track, index) => {
          const isCurrent = index === currentIndex;
          return (
            <li key={track.id} className={`flex items-center ${isCurrent ? "bg-white/10" : ""}`}>
              <button
                type="button"
                onClick={() => (isCurrent ? togglePlay() : playIndex(index))}
                className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 cursor-pointer"
              >
                <span className="w-5 shrink-0 text-xs tabular-nums text-white/50 flex justify-center">
                  {isCurrent && playing ? <Pause className="h-3.5 w-3.5 text-white" /> : isCurrent ? <Play className="h-3.5 w-3.5 text-white" /> : index + 1}
                </span>
                <span className={`flex-1 min-w-0 truncate text-sm ${isCurrent ? "font-semibold" : ""}`}>{track.title}</span>
                <span className="text-xs tabular-nums text-white/50">{formatDuration(track.durationSeconds)}</span>
              </button>
              {allowDownload && (
                <a
                  href={`${audioUrl(track.id)}?download=1`}
                  aria-label={`Descargar ${track.title}`}
                  title="Descargar"
                  className="p-3 text-white/60 hover:text-white"
                >
                  <Download className="h-4 w-4" />
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
