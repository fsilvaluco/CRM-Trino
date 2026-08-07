"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { MoneyInput } from "@/components/shared/MoneyInput";
import { Checkbox } from "@/components/ui/checkbox";
import { liquidoToBruto, retencionFromBruto, BHE_RETENTION_RATE } from "@/lib/bhe";
import { toast } from "sonner";
import {
  ArrowLeft, Pencil, MapPin, Clock, Music4, Wallet, FileText, Link as LinkIcon,
  Plus, Trash2, Star, ExternalLink, Loader2, Lock, LockOpen, Printer, Receipt,
  Ticket, Upload,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { LiveShow, ShowStatus, SetlistItem, CostItem, TimingItem, TicketTier } from "@/types/shows";
import { EventPrintHeader } from "@/components/events/EventPrintHeader";
import { compressImage } from "@/lib/image-compress";

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

type EventDetail = LiveShow & { setlist: SetlistItem[]; costItems: CostItem[]; timing: TimingItem[]; ticketTiers: TicketTier[] };

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
  const [extractingSetlist, setExtractingSetlist] = useState(false);
  const [showSetlistPaste, setShowSetlistPaste] = useState(false);
  const [setlistPasteText, setSetlistPasteText] = useState("");
  const setlistFileInputRef = useRef<HTMLInputElement>(null);

  const [timing, setTiming] = useState<TimingItem[]>([]);
  const [timingDirty, setTimingDirty] = useState(false);
  const [savingTiming, setSavingTiming] = useState(false);
  const [newTimeLabel, setNewTimeLabel] = useState("");
  const [newActivity, setNewActivity] = useState("");
  const [newTimingResponsable, setNewTimingResponsable] = useState("");
  const [newTimingResponsableContactId, setNewTimingResponsableContactId] = useState<string | null>(null);
  const [newTimingNotes, setNewTimingNotes] = useState("");
  const [extractingTiming, setExtractingTiming] = useState(false);
  const [showTimingPaste, setShowTimingPaste] = useState(false);
  const [timingPasteText, setTimingPasteText] = useState("");
  const timingFileInputRef = useRef<HTMLInputElement>(null);

  const [ticketTiers, setTicketTiers] = useState<TicketTier[]>([]);
  const [ticketsDirty, setTicketsDirty] = useState(false);
  const [savingTickets, setSavingTickets] = useState(false);
  const [extractingTickets, setExtractingTickets] = useState(false);
  const [newTierLabel, setNewTierLabel] = useState("");
  const [newTierPrice, setNewTierPrice] = useState("");
  const [newTierQty, setNewTierQty] = useState("");
  const [newTierCapacity, setNewTierCapacity] = useState("");
  const ticketFileInputRef = useRef<HTMLInputElement>(null);

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
        setTiming(data.timing ?? []);
        setTicketTiers(data.ticketTiers ?? []);
        setCostItems(data.costItems ?? []);
        setEventLink(data.eventLink ?? "");
        setRiderLocal(data.riderLocal ?? "");
        setRiderBanda(data.riderBanda ?? "");
        setSetlistDirty(false);
        setCostsDirty(false);
        setTimingDirty(false);
        setTicketsDirty(false);
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

  function appendSongs(titles: string[]) {
    if (titles.length === 0) {
      toast.info("No se encontraron canciones -- revisa que se vea la lista completa");
      return;
    }
    setSetlist((prev) => [
      ...prev,
      ...titles.map((title, i) => ({ id: `tmp-${newId()}`, position: prev.length + i, title, notes: null })),
    ]);
    setSetlistDirty(true);
    toast.success(`${titles.length} canción(es) agregadas -- revisa el orden antes de guardar`);
  }

  async function handleSetlistFile(file: File) {
    setExtractingSetlist(true);
    try {
      const lowerName = file.name.toLowerCase();
      if (file.type.startsWith("image/")) {
        const { base64, mediaType } = await compressImage(file);
        const res = await fetch("/api/eventos/setlist-extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "image", imageBase64: base64, mediaType }),
        });
        const data = await res.json();
        if (!res.ok) return toast.error(data?.error ?? "No se pudo leer la imagen");
        appendSongs(data.songs ?? []);
      } else if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
        const pdfBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
          reader.readAsDataURL(file);
        });
        const res = await fetch("/api/eventos/setlist-extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "pdf", pdfBase64 }),
        });
        const data = await res.json();
        if (!res.ok) return toast.error(data?.error ?? "No se pudo leer el PDF");
        appendSongs(data.songs ?? []);
      } else if (file.type === "text/plain" || lowerName.endsWith(".txt")) {
        const text = await file.text();
        const res = await fetch("/api/eventos/setlist-extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "text", text }),
        });
        const data = await res.json();
        if (!res.ok) return toast.error(data?.error ?? "No se pudo leer el archivo");
        appendSongs(data.songs ?? []);
      } else {
        toast.error("Formato no soportado -- sube una imagen, PDF o .txt");
      }
    } catch {
      toast.error("Error al procesar el archivo");
    } finally {
      setExtractingSetlist(false);
    }
  }

  async function handleSetlistPaste() {
    if (!setlistPasteText.trim()) return;
    setExtractingSetlist(true);
    try {
      const res = await fetch("/api/eventos/setlist-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "text", text: setlistPasteText }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "No se pudo leer el texto");
        return;
      }
      appendSongs(data.songs ?? []);
      setSetlistPasteText("");
      setShowSetlistPaste(false);
    } catch {
      toast.error("Error al procesar el texto");
    } finally {
      setExtractingSetlist(false);
    }
  }

  function appendTimingItems(items: Array<{ timeLabel: string | null; activity: string; responsable: string | null; notes: string | null }>) {
    if (items.length === 0) {
      toast.info("No se encontraron filas -- revisa que se vea el cronograma completo");
      return;
    }
    setTiming((prev) => [
      ...prev,
      ...items.map((it, i) => ({
        id: `tmp-${newId()}`,
        position: prev.length + i,
        timeLabel: it.timeLabel,
        activity: it.activity || "Sin detalle",
        responsable: it.responsable,
        responsableContactId: null,
        notes: it.notes,
      })),
    ]);
    setTimingDirty(true);
    toast.success(`${items.length} fila(s) agregadas -- revisa el orden y los datos antes de guardar`);
  }

  async function handleTimingFile(file: File) {
    setExtractingTiming(true);
    try {
      const lowerName = file.name.toLowerCase();
      if (file.type.startsWith("image/")) {
        const { base64, mediaType } = await compressImage(file);
        const res = await fetch("/api/eventos/timing-extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "image", imageBase64: base64, mediaType }),
        });
        const data = await res.json();
        if (!res.ok) return toast.error(data?.error ?? "No se pudo leer la imagen");
        appendTimingItems(data.items ?? []);
      } else if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
        const pdfBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
          reader.readAsDataURL(file);
        });
        const res = await fetch("/api/eventos/timing-extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "pdf", pdfBase64 }),
        });
        const data = await res.json();
        if (!res.ok) return toast.error(data?.error ?? "No se pudo leer el PDF");
        appendTimingItems(data.items ?? []);
      } else if (file.type === "text/plain" || lowerName.endsWith(".txt")) {
        const text = await file.text();
        const res = await fetch("/api/eventos/timing-extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "text", text }),
        });
        const data = await res.json();
        if (!res.ok) return toast.error(data?.error ?? "No se pudo leer el archivo");
        appendTimingItems(data.items ?? []);
      } else {
        toast.error("Formato no soportado -- sube una imagen, PDF o .txt");
      }
    } catch {
      toast.error("Error al procesar el archivo");
    } finally {
      setExtractingTiming(false);
    }
  }

  async function handleTimingPaste() {
    if (!timingPasteText.trim()) return;
    setExtractingTiming(true);
    try {
      const res = await fetch("/api/eventos/timing-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "text", text: timingPasteText }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "No se pudo leer el texto");
        return;
      }
      appendTimingItems(data.items ?? []);
      setTimingPasteText("");
      setShowTimingPaste(false);
    } catch {
      toast.error("Error al procesar el texto");
    } finally {
      setExtractingTiming(false);
    }
  }

  async function saveTiming() {
    setSavingTiming(true);
    try {
      const res = await fetch(`/api/eventos/${id}/timing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: timing.map((t) => ({
            id: t.id.startsWith("tmp-") ? undefined : t.id,
            timeLabel: t.timeLabel,
            activity: t.activity,
            responsable: t.responsable,
            responsableContactId: t.responsableContactId,
            notes: t.notes,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Timing guardado");
      load();
    } catch {
      toast.error("No se pudo guardar el timing");
    } finally {
      setSavingTiming(false);
    }
  }

  async function saveTickets() {
    setSavingTickets(true);
    try {
      const res = await fetch(`/api/eventos/${id}/tickets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: ticketTiers.map((t) => ({
            id: t.id.startsWith("tmp-") ? undefined : t.id,
            label: t.label,
            unitPrice: t.unitPrice,
            quantitySold: t.quantitySold,
            capacity: t.capacity,
            statusLabel: t.statusLabel,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Entradas guardadas");
      load();
    } catch {
      toast.error("No se pudieron guardar las entradas");
    } finally {
      setSavingTickets(false);
    }
  }

  async function applyTicketsToIncome() {
    const total = ticketTiers.reduce((sum, t) => sum + t.unitPrice * t.quantitySold, 0);
    try {
      const res = await fetch(`/api/eventos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketIncome: total }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Entradas del evento actualizadas a ${formatCents(total)}`);
      load();
    } catch {
      toast.error("No se pudo actualizar el ingreso por entradas");
    }
  }

  async function handleTicketScreenshot(file: File) {
    setExtractingTickets(true);
    try {
      const { base64, mediaType } = await compressImage(file);
      const res = await fetch("/api/eventos/tickets-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "No se pudo leer el pantallazo");
        return;
      }
      const tiers = Array.isArray(data.tiers) ? data.tiers : [];
      if (tiers.length === 0) {
        toast.info("No se encontraron tramos en la imagen -- revisa que se vea la tabla completa");
        return;
      }
      setTicketTiers((prev) => [
        ...prev,
        ...tiers.map((t: { label: string; unitPrice: number | null; quantitySold: number | null; capacity: number | null; statusLabel: string | null }, i: number) => ({
          id: `tmp-${newId()}`,
          position: prev.length + i,
          label: t.label || "Tramo",
          unitPrice: t.unitPrice != null ? Math.round(t.unitPrice * 100) : 0,
          quantitySold: t.quantitySold ?? 0,
          capacity: t.capacity ?? null,
          statusLabel: t.statusLabel ?? null,
        })),
      ]);
      setTicketsDirty(true);
      toast.success(`${tiers.length} tramo(s) leídos -- revisa los números antes de guardar`);
    } catch {
      toast.error("Error al procesar la imagen");
    } finally {
      setExtractingTickets(false);
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

  function printSection(section: "costs" | "timing" | "setlist" | "todo") {
    document.body.setAttribute("data-print-section", section);
    window.print();
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
  const eventProject = projects.find((p) => p.id === event.projectId);

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
          .no-print { display: none !important; }
          [data-section] { display: none !important; }
          [data-section="header"] { display: none !important; }
          body[data-print-section="todo"] [data-section] { display: block !important; }
          body[data-print-section="todo"] [data-section="header"] { display: flex !important; }
          body[data-print-section="costs"] [data-section="header"] { display: flex !important; }
          body[data-print-section="costs"] [data-section="summary"],
          body[data-print-section="costs"] [data-section="costs"] { display: block !important; }
          body[data-print-section="timing"] [data-section="header"] { display: flex !important; }
          body[data-print-section="timing"] [data-section="timing"] { display: block !important; }
          body[data-print-section="setlist"] [data-section="header"] { display: flex !important; }
          body[data-print-section="setlist"] [data-section="setlist"] { display: block !important; }
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
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => printSection("todo")}>
            <Printer className="h-4 w-4 mr-1.5" />
            Imprimir todo
          </Button>
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1.5" />
            Editar
          </Button>
        </div>
      </div>

      {/* Encabezado compartido por todas las impresiones -- logo/avatar del
          proyecto (o el que sincroniza Instagram si no hay uno subido a mano),
          nombre del proyecto, nombre y fecha del evento. */}
      <EventPrintHeader
        projectName={event.projectName}
        projectAvatarUrl={eventProject?.avatarUrl ?? null}
        eventName={event.name}
        eventDateLabel={`${formatDate(event.date)} · ${event.venue}${event.city ? `, ${event.city}` : ""}`}
      />

      {/* Resumen financiero */}
      <div className="grid grid-cols-4 gap-3" data-section="summary">
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
      <Card data-section="setlist">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <Music4 className="h-4 w-4" />
            Setlist
          </CardTitle>
          <div className="flex items-center gap-2 no-print">
            {setlistDirty && (
              <Button size="sm" className="h-7 text-xs cursor-pointer" disabled={savingSetlist} onClick={saveSetlist}>
                {savingSetlist ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar setlist"}
              </Button>
            )}
            <input
              ref={setlistFileInputRef}
              type="file"
              accept="image/*,.pdf,.txt,text/plain,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleSetlistFile(file);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs cursor-pointer"
              disabled={extractingSetlist}
              onClick={() => setlistFileInputRef.current?.click()}
            >
              {extractingSetlist ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
              {extractingSetlist ? "Leyendo..." : "Subir archivo"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" onClick={() => printSection("setlist")}>
              <Printer className="h-3.5 w-3.5 mr-1" />
              Imprimir
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Version limpia, solo para imprimir/mandar a musicos -- sin inputs editables */}
          {setlist.length > 0 && (
            <ol className="hidden print:block list-decimal pl-5 space-y-1 text-sm">
              {setlist.map((song) => <li key={song.id}>{song.title}</li>)}
            </ol>
          )}

          <div className="no-print space-y-3">
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

            {showSetlistPaste ? (
              <div className="space-y-2 pt-1 border-t">
                <Textarea
                  placeholder="Pega el setlist acá, una canción por línea..."
                  value={setlistPasteText}
                  onChange={(e) => setSetlistPasteText(e.target.value)}
                  rows={4}
                  className="text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs cursor-pointer" onClick={() => setShowSetlistPaste(false)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs cursor-pointer"
                    disabled={extractingSetlist || !setlistPasteText.trim()}
                    onClick={handleSetlistPaste}
                  >
                    {extractingSetlist ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Leer"}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowSetlistPaste(true)}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer pt-1"
              >
                o pegar texto directamente
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Timing / Cronograma */}
      <Card data-section="timing">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Timing / Cronograma
          </CardTitle>
          <div className="flex items-center gap-2 no-print">
            {timingDirty && (
              <Button size="sm" className="h-7 text-xs cursor-pointer" disabled={savingTiming} onClick={saveTiming}>
                {savingTiming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar timing"}
              </Button>
            )}
            <input
              ref={timingFileInputRef}
              type="file"
              accept="image/*,.pdf,.txt,text/plain,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleTimingFile(file);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs cursor-pointer"
              disabled={extractingTiming}
              onClick={() => timingFileInputRef.current?.click()}
            >
              {extractingTiming ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
              {extractingTiming ? "Leyendo..." : "Subir archivo"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" onClick={() => printSection("timing")}>
              <Printer className="h-3.5 w-3.5 mr-1" />
              Imprimir
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Version limpia, solo para imprimir/mandar a produccion -- sin inputs editables */}
          {timing.length > 0 && (
            <table className="hidden print:table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="text-left py-1 pr-3 font-medium">Hora</th>
                  <th className="text-left py-1 pr-3 font-medium">Detalle</th>
                  <th className="text-left py-1 pr-3 font-medium">Responsable</th>
                  <th className="text-left py-1 font-medium">Notas</th>
                </tr>
              </thead>
              <tbody>
                {timing.map((item) => (
                  <tr key={item.id} className="border-b border-slate-200">
                    <td className="py-1 pr-3 whitespace-nowrap">{item.timeLabel || "—"}</td>
                    <td className="py-1 pr-3">{item.activity}</td>
                    <td className="py-1 pr-3">{item.responsable || "—"}</td>
                    <td className="py-1">{item.notes || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="no-print space-y-3">
          {timing.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ítems en el cronograma todavía.</p>
          ) : (
            <SortableList
              items={timing}
              onReorder={(items) => { setTiming(items); setTimingDirty(true); }}
              renderItem={(item) => {
                function updateTimingItem(patch: Partial<TimingItem>) {
                  setTiming((prev) => prev.map((t) => (t.id === item.id ? { ...t, ...patch } : t)));
                  setTimingDirty(true);
                }
                return (
                  <div className="space-y-1.5 pb-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Hora (ej. 14:30 o 15:00-16:30)"
                        value={item.timeLabel ?? ""}
                        onChange={(e) => updateTimingItem({ timeLabel: e.target.value })}
                        className="h-8 w-40 shrink-0"
                      />
                      <Input
                        placeholder="Detalle / actividad"
                        value={item.activity}
                        onChange={(e) => updateTimingItem({ activity: e.target.value })}
                        className="h-8 flex-1"
                      />
                      <button
                        onClick={() => {
                          setTiming((prev) => prev.filter((t) => t.id !== item.id));
                          setTimingDirty(true);
                        }}
                        className="text-muted-foreground hover:text-destructive cursor-pointer p-1 shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 pl-0.5">
                      <TypeaheadInput
                        placeholder="Responsable"
                        value={item.responsable ?? ""}
                        onChange={(v) => updateTimingItem({ responsable: v, responsableContactId: null })}
                        onSelectSuggestion={(s) => updateTimingItem({ responsable: s.label, responsableContactId: s.value ?? null })}
                        fetchSuggestions={fetchResponsableSuggestions}
                        className="h-7 text-xs w-48 shrink-0"
                      />
                      <Input
                        placeholder="Notas / detalles"
                        value={item.notes ?? ""}
                        onChange={(e) => updateTimingItem({ notes: e.target.value })}
                        className="h-7 text-xs flex-1"
                      />
                    </div>
                  </div>
                );
              }}
            />
          )}

          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-2">
              <TypeaheadInput
                placeholder="Responsable"
                value={newTimingResponsable}
                onChange={(v) => { setNewTimingResponsable(v); setNewTimingResponsableContactId(null); }}
                onSelectSuggestion={(s) => { setNewTimingResponsable(s.label); setNewTimingResponsableContactId(s.value ?? null); }}
                fetchSuggestions={fetchResponsableSuggestions}
                className="h-7 text-xs w-48 shrink-0"
              />
              <Input
                placeholder="Notas / detalles"
                value={newTimingNotes}
                onChange={(e) => setNewTimingNotes(e.target.value)}
                className="h-7 text-xs flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 cursor-pointer"
                disabled={!newActivity.trim()}
                onClick={() => {
                  setTiming((prev) => [
                    ...prev,
                    {
                      id: `tmp-${newId()}`,
                      position: prev.length,
                      timeLabel: newTimeLabel || null,
                      activity: newActivity.trim(),
                      responsable: newTimingResponsable || null,
                      responsableContactId: newTimingResponsableContactId,
                      notes: newTimingNotes || null,
                    },
                  ]);
                  setNewTimeLabel("");
                  setNewActivity("");
                  setNewTimingResponsable("");
                  setNewTimingResponsableContactId(null);
                  setNewTimingNotes("");
                  setTimingDirty(true);
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {showTimingPaste ? (
              <div className="space-y-2 pt-1 border-t">
                <Textarea
                  placeholder="Pega el cronograma acá (hora, actividad, responsable, notas)..."
                  value={timingPasteText}
                  onChange={(e) => setTimingPasteText(e.target.value)}
                  rows={4}
                  className="text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs cursor-pointer" onClick={() => setShowTimingPaste(false)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs cursor-pointer"
                    disabled={extractingTiming || !timingPasteText.trim()}
                    onClick={handleTimingPaste}
                  >
                    {extractingTiming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Leer"}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowTimingPaste(true)}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer pt-1"
              >
                o pegar texto directamente
              </button>
            )}
          </div>
          </div>
        </CardContent>
      </Card>

      {/* Venta de entradas */}
      <Card data-section="tickets">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <Ticket className="h-4 w-4" />
            Venta de entradas
          </CardTitle>
          <div className="flex items-center gap-2 no-print">
            {ticketsDirty && (
              <Button size="sm" className="h-7 text-xs cursor-pointer" disabled={savingTickets} onClick={saveTickets}>
                {savingTickets ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar entradas"}
              </Button>
            )}
            <input
              ref={ticketFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleTicketScreenshot(file);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs cursor-pointer"
              disabled={extractingTickets}
              onClick={() => ticketFileInputRef.current?.click()}
            >
              {extractingTickets ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
              {extractingTickets ? "Leyendo..." : "Subir pantallazo"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Version limpia, solo para "Imprimir todo" -- sin inputs editables */}
          {ticketTiers.length > 0 && (
            <table className="hidden print:table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="text-left py-1 pr-3 font-medium">Tramo</th>
                  <th className="text-right py-1 pr-3 font-medium">Precio</th>
                  <th className="text-right py-1 pr-3 font-medium">Vendidas</th>
                  <th className="text-right py-1 font-medium">Cupos</th>
                </tr>
              </thead>
              <tbody>
                {ticketTiers.map((tier) => (
                  <tr key={tier.id} className="border-b border-slate-200">
                    <td className="py-1 pr-3">{tier.label}</td>
                    <td className="py-1 pr-3 text-right">{formatCents(tier.unitPrice)}</td>
                    <td className="py-1 pr-3 text-right">{tier.quantitySold}</td>
                    <td className="py-1 text-right">{tier.capacity ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="no-print space-y-3">
          {ticketTiers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin tramos agregados todavía. Puedes agregarlos a mano o subir un pantallazo de tu plataforma de
              tickets (PortalTickets, Passline, etc.) para que se lean solos.
            </p>
          ) : (
            <SortableList
              items={ticketTiers}
              onReorder={(items) => { setTicketTiers(items); setTicketsDirty(true); }}
              renderItem={(tier) => {
                function updateTier(patch: Partial<TicketTier>) {
                  setTicketTiers((prev) => prev.map((t) => (t.id === tier.id ? { ...t, ...patch } : t)));
                  setTicketsDirty(true);
                }
                return (
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Tramo (ej. Preventa 1)"
                      value={tier.label}
                      onChange={(e) => updateTier({ label: e.target.value })}
                      className="h-8 flex-1"
                    />
                    <div className="w-28 shrink-0">
                      <MoneyInput
                        placeholder="Precio"
                        value={tier.unitPrice ? String(tier.unitPrice / 100) : ""}
                        onChange={(digits) => updateTier({ unitPrice: digits ? parseInt(digits, 10) * 100 : 0 })}
                      />
                    </div>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="Vendidas"
                      value={tier.quantitySold || ""}
                      onChange={(e) => updateTier({ quantitySold: parseInt(e.target.value, 10) || 0 })}
                      className="h-8 w-24 shrink-0"
                    />
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="Cupos"
                      value={tier.capacity ?? ""}
                      onChange={(e) => updateTier({ capacity: e.target.value ? parseInt(e.target.value, 10) : null })}
                      className="h-8 w-20 shrink-0"
                    />
                    <Input
                      placeholder="Estado"
                      value={tier.statusLabel ?? ""}
                      onChange={(e) => updateTier({ statusLabel: e.target.value || null })}
                      className="h-8 w-28 shrink-0"
                    />
                    <button
                      onClick={() => {
                        setTicketTiers((prev) => prev.filter((t) => t.id !== tier.id));
                        setTicketsDirty(true);
                      }}
                      className="text-muted-foreground hover:text-destructive cursor-pointer p-1 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              }}
            />
          )}

          <div className="flex items-center gap-2 pt-1">
            <Input
              placeholder="Tramo nuevo"
              value={newTierLabel}
              onChange={(e) => setNewTierLabel(e.target.value)}
              className="h-8 flex-1"
            />
            <div className="w-28 shrink-0">
              <MoneyInput placeholder="Precio" value={newTierPrice} onChange={setNewTierPrice} />
            </div>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Vendidas"
              value={newTierQty}
              onChange={(e) => setNewTierQty(e.target.value)}
              className="h-8 w-24 shrink-0"
            />
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Cupos"
              value={newTierCapacity}
              onChange={(e) => setNewTierCapacity(e.target.value)}
              className="h-8 w-20 shrink-0"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 cursor-pointer"
              disabled={!newTierLabel.trim()}
              onClick={() => {
                setTicketTiers((prev) => [
                  ...prev,
                  {
                    id: `tmp-${newId()}`,
                    position: prev.length,
                    label: newTierLabel.trim(),
                    unitPrice: newTierPrice ? parseInt(newTierPrice, 10) * 100 : 0,
                    quantitySold: newTierQty ? parseInt(newTierQty, 10) : 0,
                    capacity: newTierCapacity ? parseInt(newTierCapacity, 10) : null,
                    statusLabel: null,
                  },
                ]);
                setNewTierLabel("");
                setNewTierPrice("");
                setNewTierQty("");
                setNewTierCapacity("");
                setTicketsDirty(true);
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          </div>

          {ticketTiers.length > 0 && (
            <div className="flex items-center justify-between border-t pt-2">
              <p className="text-sm text-muted-foreground">
                {ticketTiers.reduce((sum, t) => sum + t.quantitySold, 0)} entradas vendidas · Total:{" "}
                <span className="font-semibold text-foreground">
                  {formatCents(ticketTiers.reduce((sum, t) => sum + t.unitPrice * t.quantitySold, 0))}
                </span>
              </p>
              <Button size="sm" variant="ghost" className="h-7 text-xs cursor-pointer no-print" onClick={applyTicketsToIncome}>
                Usar como Entradas del evento
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Costos */}
      <Card data-section="costs">
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
            <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" onClick={() => printSection("costs")}>
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
          {costSheetClosed && (
            <p className="text-xs text-muted-foreground no-print">
              Caja cerrada{event.costSheetClosedAt ? ` el ${format(new Date(event.costSheetClosedAt), "d MMM yyyy, HH:mm", { locale: es })}` : ""}.
              Reábrela si necesitas corregir algo.
            </p>
          )}

          {costItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin items de costo agregados todavía.</p>
          ) : (
            <table className="hidden print:table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="text-left py-1 pr-3 font-medium">Detalle</th>
                  <th className="text-left py-1 pr-3 font-medium">Responsable</th>
                  <th className="text-right py-1 font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {costItems.map((item) => (
                  <tr key={item.id} className="border-b border-slate-200">
                    <td className="py-1 pr-3">{item.label}</td>
                    <td className="py-1 pr-3">{item.responsable || "—"}</td>
                    <td className="py-1 text-right">{formatCents(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="no-print space-y-3">
          {costItems.length === 0 ? null : (
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
                        <MoneyInput
                          placeholder={item.esBhe ? "Líquido" : "$0"}
                          value={displayAmount ? String(displayAmount / 100) : ""}
                          disabled={costSheetClosed}
                          onChange={(digits) => {
                            const cents = digits ? parseInt(digits, 10) * 100 : 0;
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
                              const liquido = item.amount;
                              updateItem({ esBhe: true, liquidoAmount: liquido, amount: liquidoToBruto(liquido) });
                            } else {
                              updateItem({ esBhe: false, amount: item.liquidoAmount ?? item.amount, liquidoAmount: null });
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
                  <MoneyInput
                    placeholder={newCostEsBhe ? "Líquido" : "$0"}
                    value={newCostAmount}
                    onChange={setNewCostAmount}
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
          </div>

          {costItems.length > 0 && (
            <div className="flex items-center justify-between border-t pt-2">
              <p className="text-sm text-muted-foreground">
                Total planilla: <span className="font-semibold text-foreground">{formatCents(costsTotal)}</span>
              </p>
              {!costSheetClosed && (
                <Button size="sm" variant="ghost" className="h-7 text-xs cursor-pointer no-print" onClick={applyCostsToExpenses}>
                  Usar como Egresos del evento
                </Button>
              )}
            </div>
          )}

          <div className="hidden print:grid grid-cols-2 gap-8 pt-12">
            <div className="text-center text-sm">
              <div className="border-t border-foreground pt-1">Firma responsable de producción</div>
            </div>
            <div className="text-center text-sm">
              <div className="border-t border-foreground pt-1">Firma quien recibe/autoriza</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Riders + link */}
      <Card data-section="riders">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            Riders y link del evento
          </CardTitle>
          {detailsDirty && (
            <Button size="sm" className="h-7 text-xs cursor-pointer no-print" disabled={savingDetails} onClick={saveDetails}>
              {savingDetails ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Version limpia, solo para "Imprimir todo" */}
          <div className="hidden print:block space-y-2 text-sm">
            {eventLink && <p><span className="font-medium">Link del evento:</span> {eventLink}</p>}
            {riderLocal && (
              <div>
                <p className="font-medium">Rider local (venue)</p>
                <p className="whitespace-pre-wrap text-slate-700">{riderLocal}</p>
              </div>
            )}
            {riderBanda && (
              <div>
                <p className="font-medium">Rider banda</p>
                <p className="whitespace-pre-wrap text-slate-700">{riderBanda}</p>
              </div>
            )}
            {!eventLink && !riderLocal && !riderBanda && <p className="text-slate-500">Sin riders ni link cargados.</p>}
          </div>

          <div className="no-print space-y-4">
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
