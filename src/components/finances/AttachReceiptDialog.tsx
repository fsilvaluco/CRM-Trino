"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload, Loader2, File, X, CheckCircle2, HelpCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

interface Candidate {
  id: string;
  description: string | null;
  category: string | null;
  amount: number;
  transactionDate: string | null;
  score: number;
}

interface Extraction {
  amount: number | null;
  vendor: string | null;
  description: string | null;
}

interface AttachReceiptDialogProps {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  projectId: string | null;
}

function formatCLP(amount: number) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);
}

// Convierte un File a base64 puro (sin el prefijo data:...;base64,)
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Flujo: subir comprobante -> IA lo lee -> le muestra al usuario el mejor
// candidato entre los gastos del presupuesto sin comprobante ("¿este pago
// se hizo para pagar X?") o, si no encuentra nada razonable, ofrece
// crearlo como gasto nuevo ("¿este pago podría ser el gasto nuevo X?").
// En cualquiera de los dos casos, el archivo queda adjunto a esa transacción.
export function AttachReceiptDialog({ open, onClose, onDone, projectId }: AttachReceiptDialogProps) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const reset = () => {
    setFile(null);
    setExtraction(null);
    setCandidates([]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast.error("El archivo no puede superar 10 MB"); return; }
    setFile(f);
    setExtraction(null);
    setCandidates([]);
    await analyze(f);
  };

  const analyze = async (f: File) => {
    setAnalyzing(true);
    try {
      const isPdf = f.type === "application/pdf";
      const base64 = await fileToBase64(f);

      const res = await fetch("/api/finances/match-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isPdf
            ? { mode: "pdf", pdfBase64: base64, projectId }
            : { mode: "image", imageBase64: base64, mediaType: f.type || "image/jpeg", projectId }
        ),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "No se pudo leer el comprobante");
        return;
      }
      setExtraction(body.extraction ?? null);
      setCandidates(Array.isArray(body.candidates) ? body.candidates : []);
    } catch {
      toast.error("Error leyendo el comprobante");
    } finally {
      setAnalyzing(false);
    }
  };

  const uploadFile = async (): Promise<{ path: string; name: string } | null> => {
    if (!file || !user) return null;
    const ext = file.name.split(".").pop();
    const storagePath = `receipts/${user.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("finances")
      .upload(storagePath, file, { upsert: false });
    if (uploadError) {
      toast.error("Error subiendo el archivo: " + uploadError.message);
      return null;
    }
    return { path: storagePath, name: file.name };
  };

  // Confirma que el comprobante corresponde a un gasto existente del
  // presupuesto -- se lo adjunta directamente.
  const handleConfirmMatch = async (candidate: Candidate) => {
    setSaving(true);
    try {
      const uploaded = await uploadFile();
      if (!uploaded) return;

      const res = await fetch(`/api/finances/${candidate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: uploaded.path, fileName: uploaded.name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Error al adjuntar");
      }
      toast.success(`Comprobante adjuntado a "${candidate.description}"`);
      onDone();
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  // No hay match razonable (o el usuario lo descarta): crea un gasto nuevo
  // con lo que la IA pudo leer y le deja el comprobante adjunto.
  const handleCreateNew = async () => {
    setSaving(true);
    try {
      const uploaded = await uploadFile();
      if (!uploaded) return;

      const amount = extraction?.amount && extraction.amount > 0 ? Math.round(extraction.amount) : null;
      if (!amount) {
        toast.error("La IA no pudo leer un monto -- crea el gasto a mano desde \"Nuevo Comprobante\"");
        return;
      }

      const description = extraction?.description || extraction?.vendor || "Gasto desde comprobante";

      const res = await fetch("/api/finances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "expense",
          amount,
          description,
          category: "Otro",
          filePath: uploaded.path,
          fileName: uploaded.name,
          projectId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Error al crear el gasto");
      }
      toast.success("Gasto nuevo creado con el comprobante adjunto");
      onDone();
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  const bestCandidate = candidates[0] ?? null;
  const hasGoodMatch = bestCandidate && bestCandidate.score >= 0.45;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adjuntar comprobante con IA</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!file && (
            <label className="flex flex-col items-center gap-2 p-6 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 transition-colors cursor-pointer">
              <Upload className="h-6 w-6 text-muted-foreground/60" />
              <span className="text-sm text-muted-foreground text-center">
                Sube el comprobante y la IA busca a qué gasto corresponde<br />
                <span className="text-xs">PDF, JPG, PNG — máx. 10 MB</span>
              </span>
              <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileChange} />
            </label>
          )}

          {file && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/30">
              <File className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm flex-1 truncate">{file.name}</span>
              {!analyzing && !saving && (
                <button type="button" onClick={reset} className="cursor-pointer text-muted-foreground hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {analyzing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Leyendo comprobante con IA…
            </div>
          )}

          {extraction && !analyzing && (
            <div className="space-y-3">
              <div className="rounded-lg border p-3 bg-muted/20 text-sm space-y-1">
                <p className="text-xs text-muted-foreground">La IA leyó:</p>
                <p><span className="text-muted-foreground">Monto:</span> {extraction.amount ? formatCLP(extraction.amount) : "no se pudo leer"}</p>
                {extraction.vendor && <p><span className="text-muted-foreground">Proveedor:</span> {extraction.vendor}</p>}
                {extraction.description && <p><span className="text-muted-foreground">Descripción:</span> {extraction.description}</p>}
              </div>

              {hasGoodMatch && bestCandidate && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <HelpCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                    <p className="text-sm">
                      ¿Este pago se hizo para pagar <strong>&quot;{bestCandidate.description}&quot;</strong>
                      {bestCandidate.category ? ` (${bestCandidate.category})` : ""} — {formatCLP(bestCandidate.amount)}?
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" className="cursor-pointer" disabled={saving} onClick={handleCreateNew}>
                      No, es otro gasto
                    </Button>
                    <Button size="sm" className="cursor-pointer" disabled={saving} onClick={() => handleConfirmMatch(bestCandidate)}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                      Sí, adjuntar aquí
                    </Button>
                  </div>

                  {candidates.length > 1 && (
                    <div className="pt-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">Otras coincidencias posibles</Label>
                      {candidates.slice(1).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          disabled={saving}
                          onClick={() => handleConfirmMatch(c)}
                          className="w-full text-left text-xs p-2 rounded border hover:bg-muted/50 cursor-pointer flex justify-between gap-2"
                        >
                          <span className="truncate">{c.description} {c.category ? `(${c.category})` : ""}</span>
                          <span className="shrink-0 text-muted-foreground">{formatCLP(c.amount)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!hasGoodMatch && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <HelpCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                    <p className="text-sm">
                      No encontré un gasto existente que coincida. ¿Este pago podría ser el gasto nuevo{" "}
                      <strong>&quot;{extraction.description || extraction.vendor || "sin descripción"}&quot;</strong>
                      {extraction.amount ? ` por ${formatCLP(extraction.amount)}` : ""}?
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" className="cursor-pointer" disabled={saving || !extraction.amount} onClick={handleCreateNew}>
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                      Sí, crear gasto nuevo
                    </Button>
                  </div>
                  {!extraction.amount && (
                    <p className="text-xs text-muted-foreground">
                      La IA no pudo leer el monto -- usa &quot;Nuevo Comprobante&quot; para cargarlo a mano.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="button" variant="outline" onClick={handleClose} className="cursor-pointer" disabled={saving}>
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
