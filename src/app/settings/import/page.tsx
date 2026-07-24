"use client";

import { useState, useRef } from "react";
import { Upload, Loader2, ArrowLeft, CheckCircle2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useProject } from "@/lib/project-context";
import { IMPORT_TARGETS, targetNeedsPlatform, type ImportTargetType } from "@/lib/import-schemas";
import type { SocialPlatform } from "@/types/analytics";

type Step = "select" | "upload" | "mapping" | "result";

interface ParseResponse {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  sampleRows: Record<string, string>[];
  suggestedMapping: Record<string, string | null>;
}

interface CommitResponse {
  ok: boolean;
  insertedCount: number;
  skippedCount: number;
  rowErrors: { row: number; reason: string }[];
  totalRowErrors: number;
  dbErrors: string[];
}

const PLATFORM_OPTIONS: { value: SocialPlatform; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "spotify", label: "Spotify" },
  { value: "facebook", label: "Facebook" },
];

export default function ImportPage() {
  const { activeProject, isAdmin } = useProject();
  const [step, setStep] = useState<Step>("select");
  const [targetType, setTargetType] = useState<ImportTargetType | "">("");
  const [platform, setPlatform] = useState<SocialPlatform | "">("");
  const [parseResult, setParseResult] = useState<ParseResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center text-sm text-muted-foreground">
        Esta página es solo para administradores.
      </div>
    );
  }

  const handleFile = async (file: File) => {
    if (!targetType) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("targetType", targetType);
      const res = await fetch("/api/admin/import/parse", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Error al leer el archivo");
        return;
      }
      setParseResult(data);
      setMapping(data.suggestedMapping ?? {});
      setStep("mapping");
    } catch {
      toast.error("Error al subir el archivo");
    } finally {
      setUploading(false);
    }
  };

  const handleCommit = async () => {
    if (!targetType || !parseResult) return;
    if (targetType !== "companies" && !activeProject?.id) {
      toast.error("Selecciona un proyecto activo antes de importar");
      return;
    }
    if (targetNeedsPlatform(targetType) && !platform) {
      toast.error("Selecciona la plataforma");
      return;
    }
    setCommitting(true);
    try {
      const res = await fetch("/api/admin/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          mapping,
          rows: parseResult.rows,
          projectId: activeProject?.id,
          platform: platform || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Error al importar");
        return;
      }
      setResult(data);
      setStep("result");
    } finally {
      setCommitting(false);
    }
  };

  const reset = () => {
    setStep("select");
    setTargetType("");
    setPlatform("");
    setParseResult(null);
    setMapping({});
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const fields = targetType ? IMPORT_TARGETS[targetType].fields : [];

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6">
      <div>
        <h1 className="text-lg font-bold">Importar datos masivos</h1>
        <p className="text-sm text-muted-foreground">
          Sube un CSV o Excel con histórico — la IA sugiere a qué campo corresponde cada columna, tú confirmas antes de guardar nada.
        </p>
      </div>

      {/* Paso 1: tipo de dato */}
      {step === "select" && (
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <div className="space-y-1.5">
            <Label>¿Qué tipo de dato vas a importar?</Label>
            <Select value={targetType} onValueChange={(v) => setTargetType(v as ImportTargetType)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un tipo" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(IMPORT_TARGETS) as ImportTargetType[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {IMPORT_TARGETS[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {targetType && <p className="text-xs text-muted-foreground">{IMPORT_TARGETS[targetType].description}</p>}
          </div>

          {targetType && targetNeedsPlatform(targetType) && (
            <div className="space-y-1.5">
              <Label>Plataforma</Label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as SocialPlatform)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una plataforma" />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORM_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {targetType && targetType !== "companies" && (
            <p className="text-xs text-muted-foreground">
              Se importa al proyecto activo: <span className="font-medium">{activeProject?.name ?? "ninguno seleccionado"}</span>
            </p>
          )}

          <Button
            size="sm"
            disabled={!targetType || (targetNeedsPlatform(targetType) && !platform)}
            onClick={() => setStep("upload")}
          >
            Siguiente
          </Button>
        </div>
      )}

      {/* Paso 2: subir archivo */}
      {step === "upload" && (
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <button
            onClick={() => setStep("select")}
            className="text-xs text-muted-foreground flex items-center gap-1 hover:underline"
          >
            <ArrowLeft className="h-3 w-3" /> Volver
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full rounded-lg border border-dashed p-8 flex flex-col items-center gap-2 text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
          >
            {uploading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" /> Leyendo archivo y sugiriendo mapeo...
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-6 w-6" />
                <span>Haz clic para subir un .csv o .xlsx</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Paso 3: mapeo de columnas */}
      {step === "mapping" && parseResult && targetType && (
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <button
            onClick={() => setStep("upload")}
            className="text-xs text-muted-foreground flex items-center gap-1 hover:underline"
          >
            <ArrowLeft className="h-3 w-3" /> Volver
          </button>
          <p className="text-sm font-medium">{parseResult.totalRows} filas detectadas — revisa el mapeo</p>

          <div className="space-y-3">
            {fields.map((field) => (
              <div key={field.key} className="grid grid-cols-2 gap-3 items-center">
                <Label className="text-sm">
                  {field.label}
                  {field.required && <span className="text-destructive"> *</span>}
                </Label>
                <Select
                  value={mapping[field.key] ?? "__none__"}
                  onValueChange={(v) => setMapping((m) => ({ ...m, [field.key]: v === "__none__" ? null : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No aplica" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No aplica</SelectItem>
                    {parseResult.headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="h-px bg-border" />

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Vista previa (primeras filas del archivo)</p>
            <div className="overflow-x-auto rounded-md border">
              <table className="text-xs w-full">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {parseResult.headers.map((h) => (
                      <th key={h} className="text-left p-2 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parseResult.sampleRows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {parseResult.headers.map((h) => (
                        <td key={h} className="p-2 whitespace-nowrap text-muted-foreground">
                          {row[h] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Button size="sm" onClick={handleCommit} disabled={committing} className="w-full">
            {committing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {!committing && <Upload className="h-4 w-4 mr-2" />}
            Importar {parseResult.totalRows} filas
          </Button>
        </div>
      )}

      {/* Resultado */}
      {step === "result" && result && (
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2">
            {result.dbErrors.length === 0 ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            )}
            <p className="text-sm font-medium">
              {result.insertedCount} filas importadas
              {result.skippedCount > 0 && `, ${result.skippedCount} omitidas`}
            </p>
          </div>

          {result.rowErrors.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1 max-h-48 overflow-y-auto">
              <p className="font-medium mb-1">
                Filas omitidas {result.totalRowErrors > 20 && `(primeras 20 de ${result.totalRowErrors})`}:
              </p>
              {result.rowErrors.map((e, i) => (
                <p key={i} className="text-muted-foreground">
                  Fila {e.row}: {e.reason}
                </p>
              ))}
            </div>
          )}

          {result.dbErrors.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs space-y-1">
              {result.dbErrors.map((e, i) => (
                <p key={i} className="text-destructive">
                  {e}
                </p>
              ))}
            </div>
          )}

          <Button size="sm" variant="outline" onClick={reset}>
            Importar otro archivo
          </Button>
        </div>
      )}
    </div>
  );
}
