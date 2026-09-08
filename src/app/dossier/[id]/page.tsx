"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Loader2, MousePointerClick } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { usePdfDocument } from "@/components/dossier/usePdfDocument";
import { PdfPageCanvas } from "@/components/dossier/PdfPageCanvas";
import { DossierFieldOverlay, type EditableDossierField } from "@/components/dossier/DossierFieldOverlay";
import { DossierFieldPanel } from "@/components/dossier/DossierFieldPanel";
import { DOSSIER_DATA_SOURCES } from "@/lib/dossier-data-sources";
import { GOOGLE_FONTS_HREF } from "@/lib/dossier-fonts";
import type { Dossier } from "@/types/analytics";

const CANVAS_WIDTH = 720;

function toEditable(dossier: Dossier): EditableDossierField[] {
  return dossier.fields.map((f) => ({ ...f, localId: f.id! }));
}

export default function DossierEditorPage() {
  const params = useParams<{ id: string }>();
  const dossierId = params.id;

  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [fields, setFields] = useState<EditableDossierField[]>([]);
  const [previewValues, setPreviewValues] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [renderedSize, setRenderedSize] = useState({ width: CANVAS_WIDTH, height: CANVAS_WIDTH * 1.41 });

  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dossierRes, previewRes] = await Promise.all([
        fetch(`/api/dossiers/${dossierId}`),
        fetch(`/api/public/dossiers/${dossierId}`),
      ]);
      if (!dossierRes.ok) throw new Error();
      const data: Dossier = await dossierRes.json();
      setDossier(data);
      setFields(toEditable(data));
      setName(data.name);
      setDirty(false);

      if (previewRes.ok) {
        const preview = await previewRes.json();
        const values: Record<string, number | null> = {};
        for (const f of preview.fields ?? []) values[f.id] = f.value;
        // El público resuelve por FIELD, no por data source -- pero acá
        // conviene indexar por data_source para que un campo nuevo (sin
        // guardar todavía) también muestre preview. Se recalcula abajo.
        setPreviewValues(values);
      }
    } catch {
      toast.error("No se pudo cargar el dossier");
    } finally {
      setLoading(false);
    }
  }, [dossierId]);

  useEffect(() => {
    load();
  }, [load]);

  // Preview indexado por data_source (no por field id) -- así un campo
  // recién agregado (sin guardar) también puede mostrar el valor actual,
  // reusando el mismo cálculo que ya se pidió para los campos guardados.
  const previewByDataSource = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const f of fields) {
      if (f.id && f.id in previewValues) map[f.dataSource] = previewValues[f.id];
    }
    return map;
  }, [fields, previewValues]);

  const pdfPath = dossier?.pdfPath ?? null;
  const pdfUrl = useMemo(() => {
    if (!pdfPath) return null;
    return supabase.storage.from("dossiers").getPublicUrl(pdfPath).data.publicUrl;
  }, [pdfPath]);

  const { pdf, numPages, loading: pdfLoading, error: pdfError } = usePdfDocument(pdfUrl);

  const fieldsOnPage = fields.filter((f) => f.pageNumber === currentPage);
  const selectedField = fields.find((f) => f.localId === selectedLocalId) ?? null;

  function updateField(localId: string, patch: Partial<EditableDossierField>) {
    setFields((prev) => prev.map((f) => (f.localId === localId ? { ...f, ...patch } : f)));
    setDirty(true);
  }

  function deleteField(localId: string) {
    setFields((prev) => prev.filter((f) => f.localId !== localId));
    setSelectedLocalId(null);
    setDirty(true);
  }

  function addFieldAt(xPct: number, yPct: number) {
    const localId = `tmp-${Math.random().toString(36).slice(2)}`;
    const newField: EditableDossierField = {
      localId,
      pageNumber: currentPage,
      xPct,
      yPct,
      dataSource: DOSSIER_DATA_SOURCES[0].key,
      fontFamily: "Inter",
      fontSize: 24,
      color: "#111111",
      bold: false,
      textAlign: "left",
    };
    setFields((prev) => [...prev, newField]);
    setSelectedLocalId(localId);
    setDirty(true);
  }

  function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    addFieldAt(Math.min(99, Math.max(1, xPct)), Math.min(99, Math.max(1, yPct)));
  }

  function handleDragStart(localId: string) {
    draggingRef.current = localId;
    const onMove = (ev: PointerEvent) => {
      const id = draggingRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!id || !rect) return;
      const xPct = Math.min(99, Math.max(1, ((ev.clientX - rect.left) / rect.width) * 100));
      const yPct = Math.min(99, Math.max(1, ((ev.clientY - rect.top) / rect.height) * 100));
      updateField(id, { xPct, yPct });
    };
    const onUp = () => {
      draggingRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  async function saveName() {
    if (!dossier || name.trim() === dossier.name) return;
    try {
      const res = await fetch(`/api/dossiers/${dossierId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error();
      setDossier((d) => (d ? { ...d, name: name.trim() } : d));
    } catch {
      toast.error("No se pudo renombrar");
    }
  }

  async function savePositions() {
    setSaving(true);
    try {
      const res = await fetch(`/api/dossiers/${dossierId}/fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: fields.map((f) => ({
            id: f.localId.startsWith("tmp-") ? undefined : f.localId,
            pageNumber: f.pageNumber,
            xPct: f.xPct,
            yPct: f.yPct,
            dataSource: f.dataSource,
            fontFamily: f.fontFamily,
            fontSize: f.fontSize,
            color: f.color,
            bold: f.bold,
            textAlign: f.textAlign,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Posiciones guardadas");
      load();
    } catch {
      toast.error("No se pudieron guardar las posiciones");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground p-4">Cargando...</p>;
  }
  if (!dossier) {
    return <p className="text-sm text-muted-foreground p-4">Dossier no encontrado.</p>;
  }

  return (
    <div className="space-y-3">
      <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/dossier">
            <Button size="sm" variant="ghost" className="cursor-pointer"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            className="h-8 text-sm font-medium max-w-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <a href={`/d/${dossierId}`} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="cursor-pointer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Ver público
            </Button>
          </a>
          <Button size="sm" disabled={!dirty || saving} onClick={savePositions} className="cursor-pointer">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            {saving ? "Guardando..." : dirty ? "Guardar posiciones" : "Sin cambios"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <MousePointerClick className="h-3.5 w-3.5" /> Clic en la página para agregar un dato · arrastra un dato existente para moverlo.
      </p>

      <div className="flex gap-4 items-start flex-wrap">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 w-7 p-0 cursor-pointer" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">Página {currentPage} de {numPages || dossier.pdfPageCount}</span>
            <Button size="sm" variant="outline" className="h-7 w-7 p-0 cursor-pointer" disabled={currentPage >= (numPages || dossier.pdfPageCount)} onClick={() => setCurrentPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div
            ref={containerRef}
            className="relative cursor-crosshair"
            style={{ width: renderedSize.width, height: renderedSize.height }}
            onClick={handleContainerClick}
          >
            {pdfLoading && !pdf ? (
              <div className="flex items-center justify-center h-96 w-full border rounded-md bg-muted/30 text-xs text-muted-foreground">
                Cargando PDF...
              </div>
            ) : pdfError ? (
              <div className="flex items-center justify-center h-96 w-full border rounded-md bg-muted/30 text-xs text-destructive">
                {pdfError}
              </div>
            ) : pdf ? (
              <PdfPageCanvas pdf={pdf} pageNumber={currentPage} targetWidth={CANVAS_WIDTH} onRendered={setRenderedSize} />
            ) : null}

            {fieldsOnPage.map((f) => (
              <DossierFieldOverlay
                key={f.localId}
                field={f}
                selected={f.localId === selectedLocalId}
                previewValue={previewByDataSource[f.dataSource]}
                onSelect={() => setSelectedLocalId(f.localId)}
                onDragStart={() => handleDragStart(f.localId)}
              />
            ))}
          </div>
        </div>

        <div className="w-64 shrink-0">
          {selectedField ? (
            <DossierFieldPanel
              field={selectedField}
              onChange={(patch) => updateField(selectedField.localId, patch)}
              onDelete={() => deleteField(selectedField.localId)}
            />
          ) : (
            <p className="text-xs text-muted-foreground p-3 border rounded-lg bg-muted/20">
              Selecciona un dato en la página (o haz clic en un espacio vacío para agregar uno nuevo) para editar su
              tipografía, color y a qué dato de ArtistPro está atado.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
