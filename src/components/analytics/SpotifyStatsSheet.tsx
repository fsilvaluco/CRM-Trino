"use client";

import { useState, useRef } from "react";
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

interface SpotifyStatsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistered: () => void;
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

const FIELD_LABELS: Record<keyof Omit<FormFields, "periodStart" | "periodEnd">, string> = {
  listeners: "Oyentes",
  monthlyActiveListeners: "Oyentes activos mensuales",
  streams: "Reproducciones",
  streamsPerListener: "Reproducciones por oyente",
  saves: "Veces que se guardó",
  playlistAdds: "Veces agregado a playlist",
  followers: "Seguidores",
};

/** Reescala y comprime la imagen en el navegador antes de mandarla — un
 * pantallazo de retina puede pesar varios MB, no hace falta esa resolución
 * para leer números en pantalla. */
function compressImage(file: File, maxWidth = 1400, quality = 0.82): Promise<{ base64: string; mediaType: "image/jpeg" }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("No se pudo procesar la imagen"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg" });
      };
      img.onerror = () => reject(new Error("No se pudo leer la imagen"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

export function SpotifyStatsSheet({ open, onOpenChange, onRegistered }: SpotifyStatsSheetProps) {
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState<"manual" | "screenshot">("manual");
  const [notFound, setNotFound] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { activeProject } = useProject();

  const reset = () => {
    setFields(EMPTY_FIELDS);
    setPreviewUrl(null);
    setSource("manual");
    setNotFound([]);
  };

  const handleFileSelect = async (file: File) => {
    setPreviewUrl(URL.createObjectURL(file));
    setExtracting(true);
    try {
      const { base64, mediaType } = await compressImage(file);
      const res = await fetch("/api/analytics/spotify/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "No se pudo leer el pantallazo");
        return;
      }
      setFields({
        periodStart: data.periodStart ?? "",
        periodEnd: data.periodEnd ?? "",
        listeners: data.listeners != null ? String(data.listeners) : "",
        monthlyActiveListeners: data.monthlyActiveListeners != null ? String(data.monthlyActiveListeners) : "",
        streams: data.streams != null ? String(data.streams) : "",
        streamsPerListener: data.streamsPerListener != null ? String(data.streamsPerListener) : "",
        saves: data.saves != null ? String(data.saves) : "",
        playlistAdds: data.playlistAdds != null ? String(data.playlistAdds) : "",
        followers: data.followers != null ? String(data.followers) : "",
      });
      setSource("screenshot");
      setNotFound(data.fieldsNotFound ?? []);
      toast.success("Pantallazo leído — revisa los números antes de guardar");
    } catch {
      toast.error("Error al procesar la imagen");
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
      const res = await fetch("/api/analytics/spotify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Error al guardar");
        return;
      }
      toast.success("Estadísticas de Spotify guardadas");
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
          <SheetTitle>Registrar estadísticas de Spotify</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 px-4 py-2">
          {/* Subida de pantallazo */}
          <div className="space-y-2">
            <Label>Pantallazo de Spotify for Artists (opcional)</Label>
            <p className="text-xs text-muted-foreground">
              Ideal: pestaña Audiencia → Descripción general. La IA lee los números — tú los revisas antes de guardar.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileSelect(file);
              }}
            />
            {previewUrl ? (
              <div className="relative rounded-lg border overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Pantallazo subido" className="w-full max-h-48 object-cover object-top" />
                <button
                  onClick={() => {
                    setPreviewUrl(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="absolute top-2 right-2 rounded-full bg-background/90 p-1 shadow"
                >
                  <X className="h-4 w-4" />
                </button>
                {extracting && (
                  <div className="absolute inset-0 bg-background/70 flex items-center justify-center gap-2 text-sm font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" /> Leyendo pantallazo...
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg border border-dashed p-6 flex flex-col items-center gap-2 text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                <ImageIcon className="h-6 w-6" />
                <span>Haz clic para subir un pantallazo</span>
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
            Guardar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
