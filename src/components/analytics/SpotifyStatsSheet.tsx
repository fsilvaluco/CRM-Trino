"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Loader2, Upload, ImageIcon, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/lib/project-context";
import type { SpotifyStatsSnapshot } from "@/types/analytics";
import { compressImage } from "@/lib/image-compress";

interface SpotifyStatsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistered: () => void;
  /** Si se pasa, el sheet edita este snapshot (PATCH) en vez de crear uno
   * nuevo (POST). */
  editingSnapshot?: SpotifyStatsSnapshot | null;
}

interface FormFields {
  periodStart: string;
  periodEnd: string;
  listeners: string;
  monthlyActiveListeners: string;
  streams: string;
  streamsPerListener: string;
  saves: string;
  playlistAdds: string;
  followers: string;
}

const EMPTY_FIELDS: FormFields = {
  periodStart: "",
  periodEnd: "",
  listeners: "",
  monthlyActiveListeners: "",
  streams: "",
  streamsPerListener: "",
  saves: "",
  playlistAdds: "",
  followers: "",
};

function snapshotToFields(s: SpotifyStatsSnapshot): FormFields {
  return {
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    listeners: s.listeners != null ? String(s.listeners) : "",
    monthlyActiveListeners: s.monthlyActiveListeners != null ? String(s.monthlyActiveListeners) : "",
    streams: s.streams != null ? String(s.streams) : "",
    streamsPerListener: s.streamsPerListener != null ? String(s.streamsPerListener) : "",
    saves: s.saves != null ? String(s.saves) : "",
    playlistAdds: s.playlistAdds != null ? String(s.playlistAdds) : "",
    followers: s.followers != null ? String(s.followers) : "",
  };
}

const FIELD_LABELS: Record<keyof Omit<FormFields, "periodStart" | "periodEnd">, string> = {
  listeners: "Oyentes",
  monthlyActiveListeners: "Oyentes activos mensuales",
  streams: "Reproducciones",
  streamsPerListener: "Reproducciones por oyente",
  saves: "Veces que se guardó",
  playlistAdds: "Veces agregado a playlist",
  followers: "Seguidores",
};

const MAX_SCREENSHOTS = 5;

export function SpotifyStatsSheet({ open, onOpenChange, onRegistered, editingSnapshot }: SpotifyStatsSheetProps) {
  const isEditing = !!editingSnapshot;
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState<"manual" | "screenshot">("manual");
  const [notFound, setNotFound] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { activeProject } = useProject();

  // Al abrir en modo edición, precarga los valores del snapshot elegido.
  useEffect(() => {
    if (open) {
      setFields(editingSnapshot ? snapshotToFields(editingSnapshot) : EMPTY_FIELDS);
      setSource(editingSnapshot?.source ?? "manual");
      setPreviewUrls([]);
      setNotFound([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingSnapshot?.id]);

  const reset = () => {
    setFields(EMPTY_FIELDS);
    setPreviewUrls([]);
    setSource("manual");
    setNotFound([]);
  };

  // Spotify for Artists reparte las métricas en varias pestañas/tarjetas
  // (Audiencia, Reproducciones, etc.) -- en el celular hace falta sacar
  // 4-5 pantallazos para juntar todos los números. Se leen todos en
  // paralelo con IA y se combinan: para cada campo, se usa el primer
  // pantallazo que sí lo trajo (no se pisa uno ya encontrado con un
  // null de otra captura que no mostraba ese dato).
  const handleFilesSelect = async (files: File[]) => {
    if (files.length > MAX_SCREENSHOTS) {
      toast.error(`Máximo ${MAX_SCREENSHOTS} pantallazos a la vez`);
      return;
    }
    setPreviewUrls(files.map((f) => URL.createObjectURL(f)));
    setExtracting(true);
    try {
      const results = await Promise.all(
        files.map(async (file) => {
          const { base64, mediaType } = await compressImage(file);
          const res = await fetch("/api/analytics/spotify/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageBase64: base64, mediaType }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error ?? "No se pudo leer un pantallazo");
          return data;
        })
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const merged: Record<string, any> = {};
      const numericKeys = Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[];
      const dateKeys = ["periodStart", "periodEnd"] as const;
      for (const data of results) {
        for (const key of [...dateKeys, ...numericKeys]) {
          if (merged[key] == null && data[key] != null) merged[key] = data[key];
        }
      }

      setFields({
        periodStart: merged.periodStart ?? "",
        periodEnd: merged.periodEnd ?? "",
        listeners: merged.listeners != null ? String(merged.listeners) : "",
        monthlyActiveListeners: merged.monthlyActiveListeners != null ? String(merged.monthlyActiveListeners) : "",
        streams: merged.streams != null ? String(merged.streams) : "",
        streamsPerListener: merged.streamsPerListener != null ? String(merged.streamsPerListener) : "",
        saves: merged.saves != null ? String(merged.saves) : "",
        playlistAdds: merged.playlistAdds != null ? String(merged.playlistAdds) : "",
        followers: merged.followers != null ? String(merged.followers) : "",
      });
      setSource("screenshot");
      // Realmente "no encontrado" = ningún pantallazo lo trajo.
      setNotFound(numericKeys.filter((k) => merged[k] == null));
      toast.success(
        files.length > 1
          ? `${files.length} pantallazos combinados — revisa los números antes de guardar`
          : "Pantallazo leído — revisa los números antes de guardar"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al procesar las imágenes");
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!activeProject?.id) {
      toast.error("Selecciona un proyecto antes de guardar");
      return;
    }
    if (!fields.periodStart || !fields.periodEnd) {
      toast.error("Completa el rango de fechas del período");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        projectId: activeProject.id,
        periodStart: fields.periodStart,
        periodEnd: fields.periodEnd,
        listeners: fields.listeners || null,
        monthlyActiveListeners: fields.monthlyActiveListeners || null,
        streams: fields.streams || null,
        streamsPerListener: fields.streamsPerListener || null,
        saves: fields.saves || null,
        playlistAdds: fields.playlistAdds || null,
        followers: fields.followers || null,
        source,
      };
      const res = await fetch(
        isEditing ? `/api/analytics/spotify/${editingSnapshot!.id}` : "/api/analytics/spotify",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Error al guardar");
        return;
      }
      toast.success(isEditing ? "Registro actualizado" : "Estadísticas de Spotify guardadas");
      reset();
      onOpenChange(false);
      onRegistered();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar registro de Spotify" : "Registrar estadísticas de Spotify"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 px-4 py-2">
          {/* Subida de pantallazo — también disponible al editar, por si
              quieres reemplazar los números leyendo una captura nueva. */}
          <div className="space-y-2">
            <Label>Pantallazos de Spotify for Artists (opcional)</Label>
            <p className="text-xs text-muted-foreground">
              Spotify reparte las métricas en varias tarjetas — subí hasta {MAX_SCREENSHOTS} pantallazos juntos (ej. Audiencia, Reproducciones, etc.) y la IA combina los números de todos. Revisa antes de guardar.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files) : [];
                if (files.length > 0) void handleFilesSelect(files);
              }}
            />
            {previewUrls.length > 0 ? (
              <div className="relative rounded-lg border overflow-hidden">
                <div className="grid grid-cols-3 gap-1 p-1">
                  {previewUrls.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={url} alt={`Pantallazo ${i + 1}`} className="w-full h-20 object-cover object-top rounded" />
                  ))}
                </div>
                <button
                  onClick={() => {
                    setPreviewUrls([]);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="absolute top-2 right-2 rounded-full bg-background/90 p-1 shadow"
                >
                  <X className="h-4 w-4" />
                </button>
                {extracting && (
                  <div className="absolute inset-0 bg-background/70 flex items-center justify-center gap-2 text-sm font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" /> Leyendo {previewUrls.length > 1 ? "pantallazos..." : "pantallazo..."}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg border border-dashed p-6 flex flex-col items-center gap-2 text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                <ImageIcon className="h-6 w-6" />
                <span>Haz clic para subir uno o varios pantallazos</span>
              </button>
            )}
            {source === "screenshot" && !extracting && (
              <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Leído con IA — revisa los campos abajo
                {notFound.length > 0 && `, no se encontraron: ${notFound.map((f) => FIELD_LABELS[f as keyof typeof FIELD_LABELS] ?? f).join(", ")}`}
              </p>
            )}
          </div>

          <div className="h-px bg-border" />

          {/* Período */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="periodStart">Desde *</Label>
              <Input
                id="periodStart"
                type="date"
                value={fields.periodStart}
                onChange={(e) => setFields((f) => ({ ...f, periodStart: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="periodEnd">Hasta *</Label>
              <Input
                id="periodEnd"
                type="date"
                value={fields.periodEnd}
                onChange={(e) => setFields((f) => ({ ...f, periodEnd: e.target.value }))}
              />
            </div>
          </div>

          {/* Métricas — todas editables, sea que vengan de la IA o se tecleen directo */}
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[]).map((key) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{FIELD_LABELS[key]}</Label>
                <Input
                  id={key}
                  type="number"
                  inputMode="decimal"
                  placeholder="—"
                  value={fields[key]}
                  onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>

        <SheetFooter>
          <Button onClick={handleSave} disabled={saving || extracting} className="w-full">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {!saving && <Upload className="h-4 w-4 mr-2" />}
            {isEditing ? "Guardar cambios" : "Guardar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
