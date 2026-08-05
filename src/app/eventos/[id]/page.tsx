"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useProject } from "@/lib/project-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { EventFormDialog } from "@/components/events/EventFormDialog";
import { SortableList } from "@/components/events/SortableList";
import { TypeaheadInput } from "@/components/events/TypeaheadInput";
import { Checkbox } from "@/components/ui/checkbox";
import { liquidoToBruto, retencionFromBruto, BHE_RETENTION_RATE } from "@/lib/bhe";
import { toast } from "sonner";
import {
  ArrowLeft, Pencil, MapPin, Clock, Music4, Wallet, FileText, Link as LinkIcon,
  Plus, Trash2, Star, ExternalLink, Loader2, Lock, LockOpen, Printer, Receipt,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { LiveShow, ShowStatus, SetlistItem, CostItem } from "@/types/shows";

const STATUS_CONFIG: Record<ShowStatus, { label: string; className: string }> = {
  cotizando: { label: "Cotizando", className: "bg-yellow-100 text-yellow-700" },
  confirmado: { label: "Confirmado", className: "bg-blue-100 text-blue-700" },
  realizado: { label: "Realizado", className: "bg-green-100 text-green-700" },
  cancelado: { label: "Cancelado", className: "bg-red-100 text-red-700" },
};

const CLP = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return CLP.format(cents / 100);
}

function formatDate(d: string) {
  try {
    return format(new Date(`${d}T00:00:00`), "EEEE d MMM yyyy", { locale: es });
  } catch {
    return d;
  }
}

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36);
}

type EventDetail = LiveShow & { setlist: SetlistItem[]; costItems: CostItem[] };

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { projects } = useProject();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const [setlist, setSetlist] = useState<SetlistItem[]>([]);
  const [setlistDirty, setSetlistDirty] = useState(false);
  const [savingSetlist, setSavingSetlist] = useState(false);
  const [newSongTitle, setNewSongTitle] = useState("");

  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [costsDirty, setCostsDirty] = useState(false);
  const [savingCosts, setSavingCosts] = useState(false);
  const [newCostLabel, setNewCostLabel] = useState("");
  const [newCostAmount, setNewCostAmount] = useState("");
  const [newCostResponsable, setNewCostResponsable] = useState("");
  const [newCostResponsableContactId, setNewCostResponsableContactId] = useState<string | null>(null);
  const [newCostComprobante, setNewCostComprobante] = useState("");
  const [newCostEsBhe, setNewCostEsBhe] = useState(false);
  const [closingCosts, setClosingCosts] = useState(false);

  const costSheetClosed = Boolean(event?.costSheetClosedAt);

  const [eventLink, setEventLink] = useState("");
  const [riderLocal, setRiderLocal] = useState("");
  const [riderBanda, setRiderBanda] = useState("");
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/eventos/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: EventDetail | null) => {
        if (!data) return;
        setEvent(data);
        setSetlist(data.setlist ?? []);
        setCostItems(data.costItems ?? []);
        setEventLink(data.eventLink ?? "");
        setRiderLocal(data.riderLocal ?? "");
        setRiderBanda(data.riderBanda ?? "");
        setSetlistDirty(false);
        setCostsDirty(false);
        setDetailsDirty(false);
      })
      .catch(() => setEvent(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSetlist() {
    setSavingSetlist(true);
    try {
      const res = await fetch(`/api/eventos/${id}/setlist`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: setlist.map((s) => ({ id: s.id.startsWith("tmp-") ? undefined : s.id, title: s.title, notes: s.notes })),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Setlist guardado");
      load();
    } catch {
      toast.error("No se pudo guardar el setlist");
    } finally {
      setSavingSetlist(false);
    }
  }

  async function saveCosts() {
    setSavingCosts(true);
    try {
      const res = await fetch(`/api/eventos/${id}/costs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: costItems.map((c) => ({
            id: c.id.startsWith("tmp-") ? undefined : c.id,
            label: c.label,
            amount: c.amount,
            notes: c.notes,
            responsable: c.responsable,
            responsableContactId: c.responsableContactId,
            comprobanteUrl: c.comprobanteUrl,
            esBhe: c.esBhe,
            liquidoAmount: c.liquidoAmount,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Costos guardados");
      load();
    } catch {
      toast.error("No se pudieron guardar los costos");
    } finally {
      setSavingCosts(false);
    }
  }

  async function saveDetails() {
    setSavingDetails(true);
    try {
      const res = await fetch(`/api/eventos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventLink: eventLink || null, riderLocal: riderLocal || null, riderBanda: riderBanda || null }),
      });
      if (!res.ok) throw new Error();
      toast.success("Guardado");
      setDetailsDirty(false);
    } catch {
      toast.error("No se pudo guardar");
    } finally {
      setSavingDetails(false);
    }
  }

  async function applyCostsToExpenses() {
    const total = costItems.reduce((sum, c) => sum + (c.amount || 0), 0);
    try {
      const res = await fetch(`/api/eventos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenses: total }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Gastos del evento actualizados a ${formatCents(total)}`);
      load();
    } catch {
      toast.error("No se pudo actualizar el gasto del evento");
    }
  }

  async function handleCopyRatingLink() {
    const url = `${window.location.origin}/rate/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado -- mándaselo a quien tocó");
    } catch {
      toast.info(url);
    }
  }

  async function closeCostSheet() {
    if (costsDirty) {
      toast.error("Guarda los costos primero antes de cerrar la caja");
      return;
    }
    if (!confirm("¿Cerrar la caja de este evento? Los costos quedarán de solo lectura hasta que la reabras.")) return;
    setClosingCosts(true);
    try {
      const res = await fetch(`/api/eventos/${id}/costs/close`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("Caja cerrada");
      load();
    } catch {
      toast.error("No se pudo cerrar la caja");
    } finally {
      setClosingCosts(false);
    }
  }

  async function reopenCostSheet() {
    setClosingCosts(true);
    try {
      const res = await fetch(`/api/eventos/${id}/costs/reopen`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("Caja reabierta");
      load();
    } catch {
      toast.error("No se pudo reabrir la caja");
    } finally {
      setClosingCosts(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 bg-muted rounded animate-pulse" />
        <div className="h-32 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Evento no encontrado.</p>
        <Link href="/eventos" className="text-sm text-primary hover:underline">Volver a Eventos</Link>
      </div>
    );
  }

  const utilidadCents = (event.fee ?? 0) + (event.ticketIncome ?? 0) - (event.expenses ?? 0);
  const costsTotal = costItems.reduce((sum, c) => sum + (c.amount || 0), 0);
  const currentEvent = event;

  async function fetchCostTypeSuggestions(query: string) {
    const res = await fetch(`/api/cost-item-types?search=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data: Array<{ id: string; name: string }> = await res.json();
    return data.map((t) => ({ label: t.name, value: t.id }));
  }

  async function fetchResponsableSuggestions(query: string) {
    if (!currentEvent.projectId) return [];
    const res = await fetch(`/api/contacts?projectId=${currentEvent.projectId}&search=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data: Array<{ id: string; name: string }> = await res.json();
    return data.map((c) => ({ label: c.name, value: c.id }));
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-cost-sheet, #print-cost-sheet * { visibility: visible; }
          #print-cost-sheet { position: absolute; left: 0; top: 0; width: 100%; border: none; box-shadow: none; }
          .no-print { display: none !important; }
        }
      `}</style>

      <button
        onClick={() => router.push("/eventos")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer no-print"
      >
        <ArrowLeft className="h-4 w-4" />
        Eventos
      </button>

      <div className="flex items-start justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{event.name}</h1>
            <Badge variant="secondary" className={`text-xs ${STATUS_CONFIG[event.status].className}`}>
              {STATUS_CONFIG[event.status].label}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
            <span className="capitalize">{formatDate(event.date)}</span>
            {event.eventTime && (
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{event.eventTime}</span>
            )}
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {event.venue}{event.city ? `, ${event.city}` : ""}
            </span>
            {event.projectName && <Badge variant="outline" className="text-xs">{event.projectName}</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {event.status === "realizado" && (
            <Button size="sm" variant="outline" className="cursor-pointer" onClick={handleCopyRatingLink}>
              <Star className="h-4 w-4 mr-1.5" />
              Link de valoración
            </Button>
          )}
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1.5" />
            Editar
          </Button>
        </div>
      </div>

      {/* Resumen financiero */}
      <div className="grid grid-cols-4 gap-3 no-print">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Fee</p><p className="font-semibold">{formatCents(event.fee)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Entradas</p><p className="font-semibold">{formatCents(event.ticketIncome)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Egresos</p><p className="font-semibold">{formatCents(event.expenses)}</p></CardContent></Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Utilidad</p>
            <p className={`font-semibold ${utilidadCents >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
              {formatCents(utilidadCents)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Setlist */}
      <Card className="no-print">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <Music4 className="h-4 w-4" />
            Setlist
          </CardTitle>
          {setlistDirty && (
            <Button size="sm" className="h-7 text-xs cursor-pointer" disabled={savingSetlist} onClick={saveSetlist}>
              {savingSetlist ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar setlist"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {setlist.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin canciones agregadas todavía.</p>
          ) : (
            <SortableList
              items={setlist}
              onReorder={(items) => { setSetlist(items); setSetlistDirty(true); }}
              renderItem={(song, index) => (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 shrink-0">{index + 1}.</span>
                  <Input
                    value={song.title}
                    onChange={(e) => {
                      setSetlist((prev) => prev.map((s) => (s.id === song.id ? { ...s, title: e.target.value } : s)));
                      setSetlistDirty(true);
                    }}
                    className="h-8"
                  />
                  <button
                    onClick={() => {
                      setSetlist((prev) => prev.filter((s) => s.id !== song.id));
                      setSetlistDirty(true);
                    }}
                    className="text-muted-foreground hover:text-destructive cursor-pointer p-1 shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            />
          )}
          <div className="flex items-center gap-2 pt-1">
            <Input
              placeholder="Agregar canción..."
              value={newSongTitle}
              onChange={(e) => setNewSongTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !newSongTitle.trim()) return;
                setSetlist((prev) => [...prev, { id: `tmp-${newId()}`, position: prev.length, title: newSongTitle.trim(), notes: null }]);
                setNewSongTitle("");
                setSetlistDirty(true);
              }}
              className="h-8"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 cursor-pointer"
              disabled={!newSongTitle.trim()}
              onClick={() => {
                setSetlist((prev) => [...prev, { id: `tmp-${newId()}`, position: prev.length, title: newSongTitle.trim(), notes: null }]);
                setNewSongTitle("");
                setSetlistDirty(true);
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Costos */}
      <Card id="print-cost-sheet">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <Wallet className="h-4 w-4" />
            Planilla de costos
            {costSheetClosed && (
              <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-700 ml-1">
                <Lock className="h-3 w-3 mr-1" />
                Cerrada
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2 no-print">
            {costsDirty && (
              <Button size="sm" className="h-7 text-xs cursor-pointer" disabled={savingCosts} onClick={saveCosts}>
                {savingCosts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar costos"}
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5 mr-1" />
              Imprimir
            </Button>
            {costSheetClosed ? (
              <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" disabled={closingCosts} onClick={reopenCostSheet}>
                <LockOpen className="h-3.5 w-3.5 mr-1" />
                Reabrir
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" disabled={closingCosts} onClick={closeCostSheet}>
                <Lock className="h-3.5 w-3.5 mr-1" />
                Cerrar caja
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Encabezado que solo se ve al imprimir -- el header de arriba de la pagina queda oculto */}
          <div className="hidden print:block mb-3">
            <p className="text-lg font-bold">{event.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatDate(event.date)} · {event.venue}{event.city ? `, ${event.city}` : ""}
            </p>
          </div>

          {costSheetClosed && (
            <p className="text-xs text-muted-foreground no-print">
              Caja cerrada{event.costSheetClosedAt ? ` el ${format(new Date(event.costSheetClosedAt), "d MMM yyyy, HH:mm", { locale: es })}` : ""}.
              Reábrela si necesitas corregir algo.
            </p>
          )}

          {costItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin items de costo agregados todavía.</p>
          ) : (
            <SortableList
              items={costItems}
              onReorder={(items) => { setCostItems(items); setCostsDirty(true); }}
              renderItem={(item) => {
                const bruto = item.esBhe ? (item.liquidoAmount != null ? liquidoToBruto(item.liquidoAmount) : item.amount) : item.amount;
                const retencion = item.esBhe ? retencionFromBruto(bruto) : 0;
                const displayAmount = item.esBhe ? item.liquidoAmount ?? 0 : item.amount;

                function updateItem(patch: Partial<CostItem>) {
                  setCostItems((prev) => prev.map((c) => (c.id === item.id ? { ...c, ...patch } : c)));
                  setCostsDirty(true);
                }

                return (
                  <div className="space-y-1.5 pb-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <TypeaheadInput
                        placeholder="Detalle (ej. Pago sonidista)"
                        value={item.label}
                        disabled={costSheetClosed}
                        onChange={(v) => updateItem({ label: v })}
                        fetchSuggestions={fetchCostTypeSuggestions}
                        className="h-8 flex-1"
                      />
                      <div className="w-32 shrink-0">
                        <Input
                          type="number"
                          inputMode="numeric"
                          placeholder={item.esBhe ? "Líquido" : "$0"}
                          value={displayAmount ? String(displayAmount / 100) : ""}
                          disabled={costSheetClosed}
                          onChange={(e) => {
                            const pesos = parseInt(e.target.value.replace(/\D/g, ""), 10);
                            const cents = Number.isFinite(pesos) ? pesos * 100 : 0;
                            if (item.esBhe) {
                              updateItem({ liquidoAmount: cents, amount: liquidoToBruto(cents) });
                            } else {
                              updateItem({ amount: cents });
                            }
                          }}
                          className="h-8"
                        />
                      </div>
                      <button
                        onClick={() => {
                          setCostItems((prev) => prev.filter((c) => c.id !== item.id));
                          setCostsDirty(true);
                        }}
                        disabled={costSheetClosed}
                        className="text-muted-foreground hover:text-destructive cursor-pointer p-1 shrink-0 disabled:opacity-30 no-print"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 pl-0.5">
                      <TypeaheadInput
                        placeholder="Responsable (a quién se le paga)"
                        value={item.responsable ?? ""}
                        disabled={costSheetClosed}
                        onChange={(v) => updateItem({ responsable: v, responsableContactId: null })}
                        onSelectSuggestion={(s) => updateItem({ responsable: s.label, responsableContactId: s.value ?? null })}
                        fetchSuggestions={fetchResponsableSuggestions}
                        className="h-7 text-xs flex-1"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <Input
                          placeholder="Link comprobante"
                          value={item.comprobanteUrl ?? ""}
                          disabled={costSheetClosed}
                          onChange={(e) => updateItem({ comprobanteUrl: e.target.value })}
                          className="h-7 text-xs w-36 no-print"
                        />
                        {item.comprobanteUrl && (
                          <a href={item.comprobanteUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                            <Receipt className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 cursor-pointer no-print">
                        <Checkbox
                          checked={item.esBhe}
                          disabled={costSheetClosed}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              updateItem({ esBhe: true, liquidoAmount: item.amount, amount: liquidoToBruto(item.amount) });
                            } else {
                              updateItem({ esBhe: false, liquidoAmount: null });
                            }
                          }}
                        />
                        BHE
                      </label>
                    </div>

                    {item.esBhe && (
                      <p className="text-xs text-muted-foreground pl-0.5">
                        Boleta (bruto): <span className="font-medium text-foreground">{formatCents(bruto)}</span>
                        {" · "}Retención ({(BHE_RETENTION_RATE * 100).toFixed(2)}%): {formatCents(retencion)}
                        {" · "}Recibe en efectivo: {formatCents(item.liquidoAmount)}
                      </p>
                    )}
                  </div>
                );
              }}
            />
          )}

          {!costSheetClosed && (
            <div className="space-y-1.5 pt-1 no-print">
              <div className="flex items-center gap-2">
                <TypeaheadInput
                  placeholder="Ítem (ej. Transporte, Catering...)"
                  value={newCostLabel}
                  onChange={setNewCostLabel}
                  fetchSuggestions={fetchCostTypeSuggestions}
                  className="h-8 flex-1"
                />
                <div className="w-32 shrink-0">
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder={newCostEsBhe ? "Líquido" : "$0"}
                    value={newCostAmount}
                    onChange={(e) => setNewCostAmount(e.target.value)}
                    className="h-8"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <TypeaheadInput
                  placeholder="Responsable"
                  value={newCostResponsable}
                  onChange={(v) => { setNewCostResponsable(v); setNewCostResponsableContactId(null); }}
                  onSelectSuggestion={(s) => { setNewCostResponsable(s.label); setNewCostResponsableContactId(s.value ?? null); }}
                  fetchSuggestions={fetchResponsableSuggestions}
                  className="h-7 text-xs flex-1"
                />
                <Input
                  placeholder="Link comprobante"
                  value={newCostComprobante}
                  onChange={(e) => setNewCostComprobante(e.target.value)}
                  className="h-7 text-xs w-36 shrink-0"
                />
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 cursor-pointer">
                  <Checkbox checked={newCostEsBhe} onCheckedChange={(v) => setNewCostEsBhe(Boolean(v))} />
                  BHE
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 cursor-pointer"
                  disabled={!newCostLabel.trim()}
                  onClick={() => {
                    const pesos = parseInt(newCostAmount.replace(/\D/g, ""), 10);
                    const cents = Number.isFinite(pesos) ? pesos * 100 : 0;
                    setCostItems((prev) => [
                      ...prev,
                      {
                        id: `tmp-${newId()}`,
                        position: prev.length,
                        label: newCostLabel.trim(),
                        amount: newCostEsBhe ? liquidoToBruto(cents) : cents,
                        liquidoAmount: newCostEsBhe ? cents : null,
                        esBhe: newCostEsBhe,
                        responsable: newCostResponsable || null,
                        responsableContactId: newCostResponsableContactId,
                        comprobanteUrl: newCostComprobante || null,
                        notes: null,
                      },
                    ]);
                    setNewCostLabel("");
                    setNewCostAmount("");
                    setNewCostResponsable("");
                    setNewCostResponsableContactId(null);
                    setNewCostComprobante("");
                    setNewCostEsBhe(false);
                    setCostsDirty(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {costItems.length > 0 && (
            <div className="flex items-center justify-between border-t pt-2">
              <p className="text-sm text-muted-foreground">
                Total planilla: <span className="font-semibold text-foreground">{formatCents(costsTotal)}</span>
              </p>
              {!costSheetClosed && (
                <Button size="sm" variant="ghost" className="h-7 text-xs cursor-pointer no-print" onClick={applyCostsToExpenses}>
                  Usar como Gastos del evento
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Riders + link */}
      <Card className="no-print">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            Riders y link del evento
          </CardTitle>
          {detailsDirty && (
            <Button size="sm" className="h-7 text-xs cursor-pointer" disabled={savingDetails} onClick={saveDetails}>
              {savingDetails ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="event-link" className="text-xs flex items-center gap-1">
              <LinkIcon className="h-3.5 w-3.5" />
              Link del evento
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="event-link"
                placeholder="https://..."
                value={eventLink}
                onChange={(e) => { setEventLink(e.target.value); setDetailsDirty(true); }}
              />
              {eventLink && (
                <a href={eventLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground shrink-0">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rider-local" className="text-xs">Rider local (venue)</Label>
              <Textarea
                id="rider-local"
                rows={5}
                placeholder="Equipamiento del venue, o pega el link a un PDF/Drive..."
                value={riderLocal}
                onChange={(e) => { setRiderLocal(e.target.value); setDetailsDirty(true); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rider-banda" className="text-xs">Rider banda</Label>
              <Textarea
                id="rider-banda"
                rows={5}
                placeholder="Requerimientos técnicos de la banda, o pega el link a un PDF/Drive..."
                value={riderBanda}
                onChange={(e) => { setRiderBanda(e.target.value); setDetailsDirty(true); }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <EventFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        defaultProjectId={event.projectId}
        editingShow={event}
        onSaved={load}
      />
    </div>
  );
}
