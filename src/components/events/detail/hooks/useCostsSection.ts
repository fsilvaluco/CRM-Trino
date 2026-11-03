"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { CostItem } from "@/types/shows";
import type { ParsedCostRow } from "@/lib/cost-sheet-io";
import { fileToBase64 } from "@/components/finances/TransactionForm";
import type { DirtyRef, EventDetail } from "../types";
import { formatCents, newId, uploadFinancesFile } from "../utils";
import { useNewCostForm } from "./useNewCostForm";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

// Estado y acciones de la Planilla de costos: ítems, reparto de utilidad,
// comprobantes y alta de ítems (a mano, desde archivo o importados).
export function useCostsSection({
  id,
  eventApiUrl,
  dirtyRef,
  reload,
}: {
  id: string;
  eventApiUrl: string;
  dirtyRef: DirtyRef;
  reload: () => void;
}) {
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profitSplitNote, setProfitSplitNote] = useState("");
  const [profitSplitProjectPct, setProfitSplitProjectPct] = useState<number | null>(null);
  const [profitSplitTrinoPct, setProfitSplitTrinoPct] = useState<number | null>(null);
  // Como se llama cada lado del reparto (migracion 100) -- vacio = el
  // default de siempre (nombre del proyecto / "Sello").
  const [profitSplitProjectLabel, setProfitSplitProjectLabel] = useState("");
  const [profitSplitTrinoLabel, setProfitSplitTrinoLabel] = useState("");
  const [transferProofUrl, setTransferProofUrl] = useState<string | null>(null);
  const [transferredAt, setTransferredAt] = useState<string | null>(null);
  const [uploadingTransferProof, setUploadingTransferProof] = useState(false);
  const [addingFromFile, setAddingFromFile] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const newCost = useNewCostForm();

  const hydrate = useCallback(
    (data: EventDetail) => {
      if (dirtyRef.current.costs) return;
      setCostItems(data.costItems ?? []);
      setProfitSplitNote(data.profitSplitNote ?? "");
      setProfitSplitProjectPct(data.profitSplitProjectPct ?? null);
      setProfitSplitTrinoPct(data.profitSplitTrinoPct ?? null);
      setProfitSplitProjectLabel(data.profitSplitProjectLabel ?? "");
      setProfitSplitTrinoLabel(data.profitSplitTrinoLabel ?? "");
      setTransferProofUrl(data.profitSplitTransferProofUrl ?? null);
      setTransferredAt(data.profitSplitTransferredAt ?? null);
      setDirty(false);
    },
    [dirtyRef]
  );

  // Cambio a mano en la planilla (ítems o reparto): queda sin guardar.
  function edit(updater: (prev: CostItem[]) => CostItem[]) {
    setCostItems(updater);
    setDirty(true);
  }

  function updateItem(itemId: string, patch: Partial<CostItem>) {
    edit((prev) => prev.map((c) => (c.id === itemId ? { ...c, ...patch } : c)));
  }

  function markDirty<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setDirty(true);
    };
  }

  // Los items que vuelven del diálogo de importar (CSV o copiados de otro
  // evento). Se agregan AL FINAL y quedan sin guardar a propósito: la persona
  // los revisa y aprieta "Guardar costos", que es la única ruta de escritura.
  //
  // Lo que nunca se copia, aunque venga en el archivo: el comprobante (es un
  // archivo del evento viejo) y el estado de pago -- un costo del evento
  // nuevo nace impago, si no la contabilidad de este evento diría que se
  // pagó algo que no se pagó.
  function handleImported(imported: ParsedCostRow[]) {
    edit((prev) => [
      ...prev,
      ...imported.map((item, i) => ({
        id: `tmp-${newId()}`,
        position: prev.length + i,
        label: item.label,
        category: item.category,
        amount: item.amount,
        liquidoAmount: item.liquidoAmount,
        esBhe: item.esBhe,
        responsable: item.responsable,
        // El responsable viaja como texto: el contacto enlazado es del otro
        // evento y puede no existir en el proyecto de este.
        responsableContactId: null,
        comprobanteUrl: null,
        pagado: false,
        comprobantePagoUrl: null,
        notes: item.notes,
        km: item.km,
        kmRate: item.kmRate,
      })),
    ]);
    toast.success(
      `${imported.length} ${imported.length === 1 ? "ítem agregado" : "ítems agregados"} -- revisa y guarda los costos`
    );
  }

  function addFromForm() {
    edit((prev) => [...prev, newCost.buildItem(prev.length)]);
    newCost.reset();
  }

  async function save() {
    setSaving(true);
    try {
      const [itemsRes, noteRes] = await Promise.all([
        fetch(`/api/eventos/${id}/costs`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: costItems.map((c) => ({
              id: c.id.startsWith("tmp-") ? undefined : c.id,
              label: c.label,
              category: c.category,
              amount: c.amount,
              notes: c.notes,
              responsable: c.responsable,
              responsableContactId: c.responsableContactId,
              comprobanteUrl: c.comprobanteUrl,
              pagado: c.pagado,
              comprobantePagoUrl: c.comprobantePagoUrl,
              esBhe: c.esBhe,
              liquidoAmount: c.liquidoAmount,
              km: c.km,
              kmRate: c.kmRate,
            })),
          }),
        }),
        fetch(eventApiUrl, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profitSplitNote: profitSplitNote.trim() || null,
            profitSplitProjectPct,
            profitSplitTrinoPct,
            profitSplitProjectLabel: profitSplitProjectLabel.trim() || null,
            profitSplitTrinoLabel: profitSplitTrinoLabel.trim() || null,
          }),
        }),
      ]);
      if (!itemsRes.ok || !noteRes.ok) throw new Error();
      toast.success("Costos guardados");
      // Bajar la bandera ANTES del refetch: `load()` no repuebla ni resetea
      // una sección con cambios sin guardar (para no pisar lo que la
      // persona está escribiendo), así que sin esto `costsDirty` quedaba
      // pegado en true y "Cerrar caja" seguía diciendo "guarda los costos
      // primero" hasta refrescar la página. El ref se toca a mano porque
      // el useEffect que lo sincroniza corre después del render, y `load()`
      // sale en este mismo tick.
      setDirty(false);
      dirtyRef.current.costs = false;
      reload();
    } catch {
      toast.error("No se pudieron guardar los costos");
    } finally {
      setSaving(false);
    }
  }

  // Guarda "pagado" / comprobante de pago al toque, en su propio endpoint
  // que no respeta el bloqueo de caja cerrada -- ver el porqué en
  // api/eventos/[id]/costs/[itemId]/payment/route.ts. Así el flujo real
  // (cerrar caja -> firman -> transferir -> subir comprobante) no queda
  // cortado por el cierre.
  async function updateItemPayment(itemId: string, patch: { pagado?: boolean; comprobantePagoUrl?: string | null }) {
    setCostItems((prev) => prev.map((c) => (c.id === itemId ? { ...c, ...patch } : c)));
    try {
      const res = await fetch(`/api/eventos/${id}/costs/${itemId}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("No se pudo guardar el estado de pago");
    }
  }

  // Comprobante (boleta/factura) de un ítem ya existente en la planilla.
  async function uploadItemComprobante(itemId: string, file: File) {
    if (file.size > MAX_FILE_BYTES) {
      toast.error("El archivo no puede superar 25 MB");
      return;
    }
    try {
      const ext = file.name.split(".").pop();
      const url = await uploadFinancesFile(`cost-items/${id}/${itemId}-${Date.now()}.${ext}`, file);
      if (!url) return;
      updateItem(itemId, { comprobanteUrl: url });
      toast.success("Comprobante adjuntado");
    } catch {
      toast.error("No se pudo subir el archivo");
    }
  }

  // Comprobante de que el ítem YA SE PAGÓ (se guarda al toque, marca pagado).
  async function uploadItemPaymentProof(itemId: string, file: File) {
    if (file.size > MAX_FILE_BYTES) {
      toast.error("El archivo no puede superar 25 MB");
      return;
    }
    try {
      const ext = file.name.split(".").pop();
      const url = await uploadFinancesFile(`cost-items/${id}/${itemId}-pago-${Date.now()}.${ext}`, file);
      if (!url) return;
      await updateItemPayment(itemId, { comprobantePagoUrl: url, pagado: true });
      toast.success("Comprobante de pago adjuntado");
    } catch {
      toast.error("No se pudo subir el archivo");
    }
  }

  async function applyToExpenses() {
    const total = costItems.reduce((sum, c) => sum + (c.amount || 0), 0);
    try {
      const res = await fetch(eventApiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenses: total }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Gastos del evento actualizados a ${formatCents(total)}`);
      reload();
    } catch {
      toast.error("No se pudo actualizar el gasto del evento");
    }
  }

  // Comprobante de la transferencia del reparto de utilidad -- pensado
  // como el paso final del evento, después de que todos firmaron: se
  // sube la captura/PDF de la transferencia y queda marcado como
  // transferido, con fecha.
  async function handleTransferProofChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error("El archivo no puede superar 25 MB");
      return;
    }
    setUploadingTransferProof(true);
    try {
      const ext = file.name.split(".").pop();
      const publicUrl = await uploadFinancesFile(`profit-split/${id}/${Date.now()}.${ext}`, file);
      if (!publicUrl) return;
      const nowIso = new Date().toISOString();
      const res = await fetch(eventApiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profitSplitTransferProofUrl: publicUrl,
          profitSplitTransferredAt: nowIso,
        }),
      });
      if (!res.ok) throw new Error();
      setTransferProofUrl(publicUrl);
      setTransferredAt(nowIso);
      toast.success("Comprobante de transferencia guardado -- evento cerrado");
    } catch {
      toast.error("No se pudo subir el comprobante");
    } finally {
      setUploadingTransferProof(false);
    }
  }

  // "Adjuntar costo": sube una boleta/factura/cotización y la lee con IA
  // (mismo extractor que /api/finances/match-receipt) para crear un ítem
  // nuevo de la planilla ya con monto, detalle y responsable rellenados --
  // reemplaza al viejo "Adjuntar documento" (que solo guardaba un archivo
  // suelto sin asociarlo a ningún gasto). Si la IA no logra leer el
  // archivo, igual se agrega el ítem con el comprobante adjunto para
  // completarlo a mano.
  async function handleAddFromFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      toast.error("El archivo no puede superar 25 MB");
      return;
    }
    setAddingFromFile(true);
    try {
      const itemId = `tmp-${newId()}`;
      const ext = file.name.split(".").pop();
      const publicUrl = await uploadFinancesFile(`cost-items/${id}/${itemId}-${Date.now()}.${ext}`, file);
      if (!publicUrl) return;

      let extraction: { amount: number | null; vendor: string | null; payer: string | null; date: string | null; description: string | null } | null = null;
      try {
        const isPdf = file.type === "application/pdf";
        const base64 = await fileToBase64(file);
        const res = await fetch("/api/finances/match-receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isPdf
              ? { mode: "pdf", pdfBase64: base64 }
              : { mode: "image", imageBase64: base64, mediaType: file.type || "image/jpeg" }
          ),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) extraction = body.extraction ?? null;
      } catch {
        // silencioso -- sin lectura IA se agrega igual, para completar a mano
      }

      const amountCents = extraction?.amount ? Math.round(extraction.amount) * 100 : 0;
      edit((prev) => [
        ...prev,
        {
          id: itemId,
          position: prev.length,
          label: extraction?.description || extraction?.vendor || file.name.replace(/\.[^.]+$/, ""),
          category: null,
          amount: amountCents,
          liquidoAmount: null,
          esBhe: false,
          responsable: extraction?.vendor ?? null,
          responsableContactId: null,
          comprobanteUrl: publicUrl,
          pagado: false,
          comprobantePagoUrl: null,
          notes: null,
          km: null,
          kmRate: null,
        },
      ]);
      toast.success(extraction ? "Costo agregado -- revisa los datos leídos antes de guardar" : "Costo agregado -- no se pudo leer con IA, complétalo a mano");
    } catch {
      toast.error("No se pudo agregar el costo");
    } finally {
      setAddingFromFile(false);
    }
  }

  return {
    costItems, dirty, saving, save, edit, updateItem, updateItemPayment,
    uploadItemComprobante, uploadItemPaymentProof, applyToExpenses,
    profitSplitNote, setProfitSplitNote: markDirty(setProfitSplitNote),
    profitSplitProjectPct, setProfitSplitProjectPct: markDirty(setProfitSplitProjectPct),
    profitSplitTrinoPct, setProfitSplitTrinoPct: markDirty(setProfitSplitTrinoPct),
    profitSplitProjectLabel, setProfitSplitProjectLabel: markDirty(setProfitSplitProjectLabel),
    profitSplitTrinoLabel, setProfitSplitTrinoLabel: markDirty(setProfitSplitTrinoLabel),
    transferProofUrl, transferredAt, uploadingTransferProof, handleTransferProofChange,
    addingFromFile, handleAddFromFile,
    importOpen, setImportOpen, handleImported,
    newCost, addFromForm,
    hydrate,
  };
}

export type CostsSectionState = ReturnType<typeof useCostsSection>;
