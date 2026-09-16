"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, Copy, AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { ParsedCostRow } from "@/lib/cost-sheet-io";

const CLP = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const formatCents = (cents: number) => CLP.format(cents / 100);

interface SourceEvent {
  id: string;
  name: string;
  date: string;
  venue: string;
  projectName: string | null;
  itemCount: number;
  total: number;
}

interface Preview {
  items: ParsedCostRow[];
  skipped: { row: number; reason: string }[];
  source: { kind: "csv" | "event"; name: string; date?: string };
}

interface Props {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Los items confirmados, ya con el switch de montos aplicado. El padre los
   * agrega al final de la planilla y los deja sin guardar. */
  onImport: (items: ParsedCostRow[]) => void;
}

/** Vista previa antes de tocar la planilla: de donde salen los costos, cuales
 * entran, cuales no y por que. Nada se escribe desde aca -- los items vuelven
 * al padre, que los agrega a la planilla en pantalla para que la persona
 * revise y apriete "Guardar costos". */
export function ImportCostsDialog({ eventId, open, onOpenChange, onImport }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [withAmounts, setWithAmounts] = useState(true);
  const [sourceEvents, setSourceEvents] = useState<SourceEvent[] | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setPreview(null);
    setSelectedEventId("");
  }

  async function handleFile(file: File) {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/eventos/${eventId}/costs/import`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo leer el archivo");
        return;
      }
      setPreview(data);
    } catch {
      toast.error("No se pudo leer el archivo");
    } finally {
      setLoading(false);
    }
  }

  const loadSourceEvents = useCallback(async () => {
    if (sourceEvents) return;
    try {
      const res = await fetch(`/api/eventos/${eventId}/costs/import`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudieron cargar los eventos");
        setSourceEvents([]);
        return;
      }
      setSourceEvents(data.events ?? []);
    } catch {
      toast.error("No se pudieron cargar los eventos");
      setSourceEvents([]);
    }
  }, [eventId, sourceEvents]);

  // "Desde otro evento" es la pestaña por defecto y onValueChange NO dispara al
  // montar, así que la lista se pide al abrir el diálogo (una sola vez: el
  // propio loadSourceEvents corta si ya la tiene).
  useEffect(() => {
    if (open) void loadSourceEvents();
  }, [open, loadSourceEvents]);

  async function handleCopyFromEvent(sourceShowId: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/eventos/${eventId}/costs/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceShowId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudieron copiar los costos");
        return;
      }
      setPreview(data);
    } catch {
      toast.error("No se pudieron copiar los costos");
    } finally {
      setLoading(false);
    }
  }

  function confirm() {
    if (!preview) return;
    const items = withAmounts
      ? preview.items
      : preview.items.map((item) => ({
          ...item,
          amount: 0,
          liquidoAmount: item.esBhe ? 0 : null,
        }));
    onImport(items);
    onOpenChange(false);
    reset();
  }

  const total = preview?.items.reduce((sum, item) => sum + item.amount, 0) ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          reset();
          // Se suelta la lista cacheada al cerrar: si la carga falló, volver a
          // abrir tiene que reintentar y no quedarse con el "no hay eventos".
          setSourceEvents(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar costos</DialogTitle>
          <DialogDescription>
            Los costos se agregan al final de la planilla: no se borra nada de lo que ya tiene el
            evento. Quedan sin guardar para que los revises.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <Tabs defaultValue="evento">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="evento" className="cursor-pointer">Desde otro evento</TabsTrigger>
              <TabsTrigger value="csv" className="cursor-pointer">Desde un archivo</TabsTrigger>
            </TabsList>

            <TabsContent value="evento" className="space-y-3 pt-3">
              <p className="text-sm text-muted-foreground">
                Elige el evento del que quieres copiar la planilla. Solo aparecen los que tienen
                costos cargados.
              </p>
              {sourceEvents === null ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando eventos...
                </div>
              ) : sourceEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No hay otros eventos con costos cargados todavía.
                </p>
              ) : (
                <>
                  <Select value={selectedEventId} onValueChange={(v) => setSelectedEventId(v ?? "")}>
                    <SelectTrigger className="w-full cursor-pointer">
                      <SelectValue placeholder="Elegir evento..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceEvents.map((ev) => (
                        <SelectItem key={ev.id} value={ev.id} className="cursor-pointer">
                          {ev.name} · {format(new Date(`${ev.date}T12:00:00`), "d MMM yyyy", { locale: es })} ·{" "}
                          {ev.itemCount} {ev.itemCount === 1 ? "ítem" : "ítems"} · {formatCents(ev.total)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    className="w-full cursor-pointer"
                    disabled={!selectedEventId || loading}
                    onClick={() => void handleCopyFromEvent(selectedEventId)}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                    Ver qué se copiaría
                  </Button>
                </>
              )}
            </TabsContent>

            <TabsContent value="csv" className="space-y-3 pt-3">
              <p className="text-sm text-muted-foreground">
                Sube un CSV o un Excel con las columnas <span className="font-medium">Detalle</span>{" "}
                y <span className="font-medium">Monto</span>. Si no sabes el formato, descarga el CSV
                de cualquier evento y úsalo de plantilla.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                className="w-full cursor-pointer"
                disabled={loading}
                onClick={() => fileInputRef.current?.click()}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                Elegir archivo
              </Button>
              <a
                href={`/api/eventos/${eventId}/costs/export?format=csv`}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <Download className="h-3 w-3" /> Descargar el CSV de este evento como plantilla
              </a>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {preview.source.kind === "csv" ? "Archivo" : "Evento"}:{" "}
              <span className="font-medium text-foreground">{preview.source.name}</span> ·{" "}
              {preview.items.length} {preview.items.length === 1 ? "ítem" : "ítems"}
            </p>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={withAmounts} onCheckedChange={(v) => setWithAmounts(Boolean(v))} />
              Traer también los montos
              <span className="text-muted-foreground text-xs">
                (si lo desmarcas, entran en $0 para que los llenes)
              </span>
            </label>

            <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
              {preview.items.map((item, i) => (
                <div key={i} className="flex items-start justify-between gap-2 px-2.5 py-1.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {[item.category, item.responsable, item.esBhe ? "BHE" : null]
                        .filter(Boolean)
                        .join(" · ") || "Sin categoría"}
                    </p>
                    {item.warnings.map((warning, w) => (
                      <p key={w} className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> {warning}
                      </p>
                    ))}
                  </div>
                  <span className="shrink-0 tabular-nums">
                    {withAmounts ? formatCents(item.amount) : formatCents(0)}
                  </span>
                </div>
              ))}
            </div>

            {withAmounts && (
              <p className="text-sm text-right">
                Total a agregar: <span className="font-semibold">{formatCents(total)}</span>
              </p>
            )}

            {preview.skipped.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 space-y-0.5">
                <p className="font-medium">
                  {preview.skipped.length} {preview.skipped.length === 1 ? "fila omitida" : "filas omitidas"}
                </p>
                {preview.skipped.map((s) => (
                  <p key={s.row}>Fila {s.row}: {s.reason}</p>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              No se copian los comprobantes ni el estado de pago: los ítems entran como no pagados.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="outline" className="cursor-pointer" onClick={reset}>
                Volver
              </Button>
              <Button className="cursor-pointer" onClick={confirm}>
                Agregar {preview.items.length} {preview.items.length === 1 ? "ítem" : "ítems"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
