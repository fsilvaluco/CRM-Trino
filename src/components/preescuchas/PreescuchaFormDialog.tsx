"use client";

import { useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Clock, ImagePlus, Loader2, Music2, X } from "lucide-react";
import { toast } from "sonner";
import {
  COVER_EXT_BY_MIME,
  PREESCUCHA_MAX_COVER_BYTES,
  PREESCUCHA_MAX_DAYS,
  PREESCUCHA_MAX_TRACKS,
  PREESCUCHA_MAX_TRACK_BYTES,
  type PreescuchaItem,
} from "@/lib/preescuchas";
import { prepareTrack, titleFromFileName } from "@/lib/audio/prepare-track";
import { uploadPreescuchaFile } from "@/lib/preescucha-upload";
import { PreescuchaTracksField, type TrackDraft } from "./PreescuchaTracksField";

interface PreescuchaFormDialogProps {
  projectId: string;
  /** Nombre del proyecto activo: sugerencia para el campo "Artista" al crear. */
  defaultArtistName?: string;
  editing: PreescuchaItem | null;
  onClose: () => void;
  onSaved: () => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const QUICK_DAYS = [7, 15, 30];

// Crear o editar una Preescucha. El componente se monta al abrir (la pagina
// lo renderiza solo mientras esta abierto), por eso el estado parte
// directo de las props, sin efecto de "reset".
export function PreescuchaFormDialog({ projectId, defaultArtistName, editing, onClose, onSaved }: PreescuchaFormDialogProps) {
  // Al crear, el id se genera aqui: los archivos se suben a su carpeta
  // antes de que exista la fila. Se conserva si el guardado se reintenta.
  const [preescuchaId] = useState(() => editing?.id ?? crypto.randomUUID());
  const convertQueue = useRef<Promise<void>>(Promise.resolve());

  const [title, setTitle] = useState(editing?.title ?? "");
  const [artistName, setArtistName] = useState(editing?.artistName ?? defaultArtistName ?? "");
  const [message, setMessage] = useState(editing?.message ?? "");
  const [allowDownload, setAllowDownload] = useState(editing?.allowDownload ?? false);
  const [days, setDays] = useState(PREESCUCHA_MAX_DAYS);
  const [expiryDate, setExpiryDate] = useState(editing ? format(new Date(editing.expiresAt), "yyyy-MM-dd") : "");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(
    editing?.hasCover ? `/api/public/preescuchas/${editing.slug}/cover?v=${encodeURIComponent(editing.updatedAt)}` : null
  );
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [uploadedCoverPath, setUploadedCoverPath] = useState<string | null>(null);
  const [tracks, setTracks] = useState<TrackDraft[]>(
    (editing?.tracks ?? []).map((t) => ({
      key: t.id,
      id: t.id,
      title: t.title,
      durationSeconds: t.durationSeconds,
      sizeBytes: t.sizeBytes,
      status: "saved",
      progress: 1,
      converted: false,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [savingLabel, setSavingLabel] = useState("");

  const maxExpiry = editing ? new Date(new Date(editing.createdAt).getTime() + PREESCUCHA_MAX_DAYS * DAY_MS) : null;
  const originalExpiryDate = editing ? format(new Date(editing.expiresAt), "yyyy-MM-dd") : "";
  const safeDays = Math.min(PREESCUCHA_MAX_DAYS, Math.max(1, Math.round(days) || 1));
  const deletionLabel = editing
    ? expiryDate
      ? format(new Date(`${expiryDate}T12:00:00`), "d 'de' MMMM", { locale: es })
      : ""
    : format(addDays(new Date(), safeDays), "d 'de' MMMM", { locale: es });

  function patchTrack(key: string, patch: Partial<TrackDraft>) {
    setTracks((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }

  async function convert(key: string, file: File) {
    try {
      const prepared = await prepareTrack(file, (progress) => patchTrack(key, { progress }));
      if (prepared.blob.size > PREESCUCHA_MAX_TRACK_BYTES) {
        throw new Error("La canción supera los 50 MB en MP3 (unos 20 minutos).");
      }
      patchTrack(key, {
        status: "ready",
        progress: 1,
        blob: prepared.blob,
        durationSeconds: prepared.durationSeconds,
        sizeBytes: prepared.blob.size,
        converted: prepared.converted,
      });
    } catch (err) {
      patchTrack(key, { status: "error", error: err instanceof Error ? err.message : "No se pudo procesar." });
    }
  }

  function handleAddFiles(files: File[]) {
    const room = PREESCUCHA_MAX_TRACKS - tracks.length;
    if (files.length > room) toast.info(`Máximo ${PREESCUCHA_MAX_TRACKS} canciones por preescucha`);
    const accepted = files.slice(0, Math.max(0, room));
    const drafts = accepted.map<TrackDraft>((file) => ({
      key: crypto.randomUUID(),
      title: titleFromFileName(file.name),
      durationSeconds: null,
      sizeBytes: null,
      status: "converting",
      progress: 0,
      converted: false,
    }));
    setTracks((prev) => [...prev, ...drafts]);
    // De a una: decodificar un WAV completo usa bastante memoria.
    drafts.forEach((draft, i) => {
      convertQueue.current = convertQueue.current.then(() => convert(draft.key, accepted[i]));
    });
  }

  function handleCoverChange(file: File | null) {
    if (!file) return;
    if (!COVER_EXT_BY_MIME[file.type]) return void toast.error("La carátula debe ser JPG, PNG o WebP");
    if (file.size > PREESCUCHA_MAX_COVER_BYTES) return void toast.error("La carátula no puede superar 5 MB");
    setCoverFile(file);
    setUploadedCoverPath(null);
    setCoverRemoved(false);
    setCoverPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!title.trim()) return void toast.error("Ponle un título a la preescucha");
    if (tracks.some((t) => t.status === "converting")) return void toast.error("Espera a que terminen de convertirse las canciones");
    if (tracks.some((t) => t.status === "error")) return void toast.error("Quita las canciones con error antes de guardar");
    if (tracks.length === 0) return void toast.error("Agrega al menos una canción");
    if (tracks.some((t) => !t.title.trim())) return void toast.error("Todas las canciones necesitan un título");

    let expiresAt: string | undefined;
    if (editing && maxExpiry && expiryDate !== originalExpiryDate) {
      const endOfDay = new Date(`${expiryDate}T23:59:59`);
      const chosen = new Date(Math.min(endOfDay.getTime(), maxExpiry.getTime()));
      if (Number.isNaN(chosen.getTime()) || chosen.getTime() <= Date.now()) return void toast.error("La fecha de vencimiento debe ser futura");
      expiresAt = chosen.toISOString();
    }

    setSaving(true);
    try {
      // 1. Subir lo nuevo (caratula y canciones). Lo ya subido en un
      //    intento anterior conserva su ruta y no se vuelve a subir.
      let coverPath = uploadedCoverPath;
      if (coverFile && !coverPath) {
        setSavingLabel("Subiendo carátula…");
        coverPath = await uploadPreescuchaFile({ projectId, preescuchaId, kind: "cover", blob: coverFile, contentType: coverFile.type });
        setUploadedCoverPath(coverPath);
      }

      const pending = tracks.filter((t) => !t.id && !t.filePath);
      const paths = new Map<string, string>();
      for (const [i, t] of pending.entries()) {
        setSavingLabel(`Subiendo canción ${i + 1} de ${pending.length}…`);
        const path = await uploadPreescuchaFile({ projectId, preescuchaId, kind: "track", blob: t.blob!, contentType: "audio/mpeg" });
        paths.set(t.key, path);
        patchTrack(t.key, { filePath: path });
      }

      // 2. Guardar.
      setSavingLabel("Guardando…");
      const trackPayload = tracks.map((t) => ({
        id: t.id,
        title: t.title.trim(),
        filePath: t.id ? undefined : (t.filePath ?? paths.get(t.key)),
        durationSeconds: t.durationSeconds,
      }));
      const common = { title: title.trim(), artistName: artistName.trim(), message: message.trim(), allowDownload, tracks: trackPayload };
      const res = editing
        ? await fetch(`/api/preescuchas/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...common, expiresAt, coverPath: coverPath ?? (coverRemoved ? null : undefined) }),
          })
        : await fetch("/api/preescuchas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...common, id: preescuchaId, projectId, expiresInDays: safeDays, coverPath }),
          });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar");

      toast.success(editing ? "Preescucha actualizada" : "Preescucha creada. Ya puedes copiar el enlace.");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
      setSavingLabel("");
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar preescucha" : "Nueva preescucha"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <Clock className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <p>
              Esta preescucha y todos sus archivos <strong>se eliminan automáticamente{deletionLabel ? ` el ${deletionLabel}` : ""}</strong>.
              Desde ese día el enlace deja de funcionar. La vigencia máxima es de {PREESCUCHA_MAX_DAYS} días.
            </p>
          </div>

          <div className="flex gap-3">
            <label className="relative h-24 w-24 shrink-0 rounded-lg border border-dashed bg-muted flex items-center justify-center overflow-hidden cursor-pointer" title="Elegir carátula">
              {coverPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview} alt="Carátula" className="h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground">
                  <ImagePlus className="h-5 w-5" />
                  Carátula
                </span>
              )}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={saving} onChange={(e) => handleCoverChange(e.target.files?.[0] ?? null)} />
              {coverPreview && !saving && (
                <button
                  type="button"
                  aria-label="Quitar carátula"
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault();
                    setCoverFile(null);
                    setUploadedCoverPath(null);
                    setCoverPreview(null);
                    setCoverRemoved(true);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </label>
            <div className="flex-1 space-y-2">
              <div className="space-y-1">
                <Label htmlFor="pre-title">Título del lanzamiento</Label>
                <Input id="pre-title" placeholder="Nombre del disco o single" value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} autoFocus />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pre-artist">Artista (opcional)</Label>
                <Input id="pre-artist" value={artistName} onChange={(e) => setArtistName(e.target.value)} disabled={saving} />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="pre-message">Mensaje para quien escucha (opcional)</Label>
            <Textarea id="pre-message" rows={3} placeholder="Ej.: Fecha de lanzamiento, créditos, contacto de prensa…" value={message} onChange={(e) => setMessage(e.target.value)} disabled={saving} />
          </div>

          <PreescuchaTracksField tracks={tracks} disabled={saving} onAddFiles={handleAddFiles} onChange={setTracks} />

          <div className="space-y-1">
            <Label htmlFor="pre-expiry">{editing ? "Disponible hasta" : "Vigencia (días)"}</Label>
            {editing && maxExpiry ? (
              <Input
                id="pre-expiry"
                type="date"
                className="w-44"
                value={expiryDate}
                min={format(addDays(new Date(), 1), "yyyy-MM-dd")}
                max={format(maxExpiry, "yyyy-MM-dd")}
                onChange={(e) => setExpiryDate(e.target.value)}
                disabled={saving}
              />
            ) : (
              <div className="flex items-center gap-2">
                <Input id="pre-expiry" type="number" min={1} max={PREESCUCHA_MAX_DAYS} className="w-20" value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={saving} />
                {QUICK_DAYS.map((d) => (
                  <Button key={d} type="button" size="sm" variant={safeDays === d ? "secondary" : "outline"} className="cursor-pointer" onClick={() => setDays(d)} disabled={saving}>
                    {d} días
                  </Button>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox checked={allowDownload} onCheckedChange={(v) => setAllowDownload(v === true)} disabled={saving} className="mt-0.5" />
            <span>
              Permitir descarga
              <span className="block text-xs text-muted-foreground">
                Quien tenga el enlace podrá bajar los MP3. Déjalo apagado salvo que se lo envíes solo a gente de confianza.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving} className="cursor-pointer">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="cursor-pointer">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Music2 className="h-4 w-4 mr-2" />}
            {saving ? savingLabel || "Guardando…" : editing ? "Guardar" : "Crear preescucha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
