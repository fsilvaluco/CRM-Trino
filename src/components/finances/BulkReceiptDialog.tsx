"use client";

// Carga masiva de comprobantes: se eligen varios archivos de una vez, la
// IA lee cada uno (mismo extractor que "Nuevo Comprobante" y "Adjuntar
// comprobante (IA)" -- /api/finances/match-receipt, ignorando los
// candidatos acá también), y se revisan/editan todos juntos en una sola
// tabla antes de crear las transacciones. Pensado para 10-20 archivos por
// tanda -- más que eso se vuelve difícil de revisar de un vistazo y
// empieza a acercarse al límite general de la API (60 req/min por IP).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, Loader2, X, Check, AlertCircle, Sparkles, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { fileToBase64, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/components/finances/TransactionForm";
import { MoneyInput } from "@/components/shared/MoneyInput";

const MAX_FILES = 25;
const CONCURRENCY = 3;

type RowStatus = "reading" | "ready" | "read-error" | "saving" | "saved" | "save-error";
type TxType = "expense" | "income";

interface DraftRow {
  localId: string;
  file: File;
  /** blob: URL local para previsualizar el archivo sin subirlo aún -- se
   * revoca al sacar la fila o cerrar el diálogo (ver revokePreview). */
  previewUrl: string;
  status: RowStatus;
  errorMessage?: string;
  type: TxType;
  amount: string;
  transactionDate: string;
  emisor: string;
  receptor: string;
  description: string;
  category: string;
}

async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export function BulkReceiptDialog({
  open, onClose, onDone, projectId,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  projectId: string | null;
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const updateRow = (localId: string, patch: Partial<DraftRow>) => {
    setRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  };

  const removeRow = (localId: string) => {
    setRows((prev) => {
      const row = prev.find((r) => r.localId === localId);
      if (row) URL.revokeObjectURL(row.previewUrl);
      return prev.filter((r) => r.localId !== localId);
    });
  };

  const reset = () => {
    setRows((prev) => {
      prev.forEach((r) => URL.revokeObjectURL(r.previewUrl));
      return [];
    });
    setSavedCount(0);
  };

  const handleClose = () => {
    if (saving) return; // no cerrar a mitad de un guardado en curso
    reset();
    onClose();
  };

  const handleFilesChosen = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, MAX_FILES - rows.length);
    if (fileList.length > files.length) {
      toast.warning(`Solo se cargaron ${files.length} archivos -- el máximo por tanda es ${MAX_FILES}`);
    }

    const newRows: DraftRow[] = files.map((file) => ({
      localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      status: "reading",
      type: "expense",
      amount: "",
      transactionDate: "",
      emisor: "",
      receptor: "",
      description: "",
      category: "",
    }));
    setRows((prev) => [...prev, ...newRows]);

    await mapWithConcurrency(newRows, CONCURRENCY, async (row) => {
      try {
        const isPdf = row.file.type === "application/pdf";
        const base64 = await fileToBase64(row.file);
        const res = await fetch("/api/finances/match-receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isPdf
              ? { mode: "pdf", pdfBase64: base64 }
              : { mode: "image", imageBase64: base64, mediaType: row.file.type || "image/jpeg" }
          ),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          updateRow(row.localId, { status: "read-error", errorMessage: body.error ?? "No se pudo leer" });
          return;
        }
        const extraction = body.extraction as {
          amount: number | null; vendor: string | null; payer: string | null; date: string | null; description: string | null;
        } | undefined;
        updateRow(row.localId, {
          status: "ready",
          amount: extraction?.amount ? String(extraction.amount) : "",
          transactionDate: extraction?.date ?? "",
          emisor: extraction?.payer ?? "",
          receptor: extraction?.vendor ?? "",
          description: extraction?.description ?? "",
        });
      } catch {
        updateRow(row.localId, { status: "read-error", errorMessage: "No se pudo leer" });
      }
    });
  };

  const categoriesFor = (type: TxType) => (type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES);

  const readyRows = rows.filter((r) => r.status !== "saving" && r.status !== "saved");
  const canSave = readyRows.length > 0 && readyRows.every((r) => Number(r.amount) > 0 && r.category);

  const handleSaveAll = async () => {
    if (!projectId || !user) return;
    setSaving(true);
    setSavedCount(0);
    let ok = 0;
    let failed = 0;

    // Secuencial a propósito -- cada fila sube un archivo + crea la
    // transacción, y queremos que el progreso ("Guardando X/N") sea
    // legible y no reventar el rate limit general subiendo todo en
    // paralelo.
    for (const row of rows) {
      if (row.status === "saved") { ok++; continue; }
      updateRow(row.localId, { status: "saving" });
      try {
        const ext = row.file.name.split(".").pop();
        const storagePath = `receipts/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const uploadResult = await supabase.storage.from("finances").upload(storagePath, row.file, { upsert: false });
        if (uploadResult.error) throw new Error(uploadResult.error.message);

        const res = await fetch("/api/finances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: row.type,
            amount: Math.round(Number(row.amount) || 0),
            description: row.description || row.file.name,
            emisor: row.emisor || null,
            receptor: row.receptor || null,
            category: row.category,
            responsibleName: user.user_metadata?.full_name || user.email || null,
            responsibleUserId: user.id,
            transactionDate: row.transactionDate || null,
            filePath: storagePath,
            fileName: row.file.name,
            projectId,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Error al guardar");
        }
        updateRow(row.localId, { status: "saved" });
        ok++;
      } catch (err) {
        updateRow(row.localId, { status: "save-error", errorMessage: err instanceof Error ? err.message : "Error" });
        failed++;
      } finally {
        setSavedCount((c) => c + 1);
      }
    }

    setSaving(false);
    if (ok > 0) toast.success(`${ok} comprobante${ok === 1 ? "" : "s"} guardado${ok === 1 ? "" : "s"}`);
    if (failed > 0) toast.error(`${failed} no se pudo${failed === 1 ? "" : "ieron"} guardar -- revisa esas filas`);
    onDone();
    if (failed === 0) {
      reset();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Carga masiva de comprobantes</DialogTitle>
        </DialogHeader>

        {rows.length === 0 ? (
          <label className="flex flex-col items-center gap-2 p-10 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 transition-colors cursor-pointer">
            <Upload className="h-7 w-7 text-muted-foreground/60" />
            <span className="text-sm text-muted-foreground text-center">
              Elige varios archivos a la vez (PDF, JPG, PNG)<br />
              <span className="text-xs">Recomendado: hasta 20 por tanda -- máximo {MAX_FILES}</span>
            </span>
            <input
              type="file" multiple className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => void handleFilesChosen(e.target.files)}
            />
          </label>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Revisa y corrige antes de guardar -- la IA solo sugiere.
              </p>
              {rows.length < MAX_FILES && !saving && (
                <label className="text-xs text-primary hover:underline cursor-pointer">
                  Agregar más archivos
                  <input
                    type="file" multiple className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => void handleFilesChosen(e.target.files)}
                  />
                </label>
              )}
            </div>

            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.localId} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    {row.file.type.startsWith("image/") ? (
                      <button
                        type="button"
                        onClick={() => window.open(row.previewUrl, "_blank", "noopener,noreferrer")}
                        className="shrink-0 cursor-pointer"
                        title="Ver comprobante"
                      >
                        <img src={row.previewUrl} alt="" className="h-8 w-8 rounded object-cover border" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => window.open(row.previewUrl, "_blank", "noopener,noreferrer")}
                        className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                        title="Ver comprobante"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    {row.status === "reading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
                    {row.status === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 shrink-0" />}
                    {row.status === "saved" && <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                    {(row.status === "read-error" || row.status === "save-error") && (
                      <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate flex-1">{row.file.name}</span>
                    {row.file.type.startsWith("image/") && (
                      <button
                        type="button"
                        onClick={() => window.open(row.previewUrl, "_blank", "noopener,noreferrer")}
                        className="cursor-pointer text-xs text-primary hover:underline shrink-0"
                      >
                        Ver
                      </button>
                    )}
                    {row.status !== "saving" && row.status !== "saved" && (
                      <button type="button" onClick={() => removeRow(row.localId)} className="cursor-pointer text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {row.errorMessage && <p className="text-xs text-destructive">{row.errorMessage}</p>}

                  {row.status !== "saved" && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Select value={row.type} onValueChange={(v) => v && updateRow(row.localId, { type: v as TxType, category: "" })}>
                        <SelectTrigger className="h-8 text-xs cursor-pointer" disabled={row.status === "saving"}>
                          <SelectValue>{row.type === "expense" ? "Gasto" : "Ingreso"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expense">Gasto</SelectItem>
                          <SelectItem value="income">Ingreso</SelectItem>
                        </SelectContent>
                      </Select>
                      <MoneyInput
                        className="h-8 text-xs" disabled={row.status === "saving"}
                        value={row.amount} onChange={(v) => updateRow(row.localId, { amount: v })}
                      />
                      <Input
                        className="h-8 text-xs" type="date" disabled={row.status === "saving"}
                        value={row.transactionDate} onChange={(e) => updateRow(row.localId, { transactionDate: e.target.value })}
                      />
                      <Select value={row.category || undefined} onValueChange={(v) => v && updateRow(row.localId, { category: v })}>
                        <SelectTrigger className="h-8 text-xs cursor-pointer" disabled={row.status === "saving"}>
                          <SelectValue placeholder="Categoría">{row.category || undefined}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {categoriesFor(row.type).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-8 text-xs" placeholder="Emisor" disabled={row.status === "saving"}
                        value={row.emisor} onChange={(e) => updateRow(row.localId, { emisor: e.target.value })}
                      />
                      <Input
                        className="h-8 text-xs" placeholder="Receptor" disabled={row.status === "saving"}
                        value={row.receptor} onChange={(e) => updateRow(row.localId, { receptor: e.target.value })}
                      />
                      <Input
                        className="h-8 text-xs col-span-2" placeholder="Glosa o comentario" disabled={row.status === "saving"}
                        value={row.description} onChange={(e) => updateRow(row.localId, { description: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <DialogFooter className="items-center gap-3">
            {saving && (
              <p className="text-xs text-muted-foreground mr-auto">Guardando {savedCount}/{rows.length}...</p>
            )}
            <Button variant="outline" onClick={handleClose} disabled={saving} className="cursor-pointer">
              Cerrar
            </Button>
            <Button onClick={handleSaveAll} disabled={!canSave || saving} className="cursor-pointer">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar {rows.filter((r) => r.status !== "saved").length} comprobante{rows.filter((r) => r.status !== "saved").length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        )}
        {!canSave && rows.length > 0 && !saving && (
          <p className="text-xs text-muted-foreground text-right -mt-2">
            Falta monto o categoría en alguna fila -- complétalos para poder guardar.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
