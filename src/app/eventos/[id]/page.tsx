"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { BencinaCalculator } from "@/components/events/BencinaCalculator";
import { SortableList } from "@/components/events/SortableList";
import { TypeaheadInput } from "@/components/events/TypeaheadInput";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { liquidoToBruto, retencionFromBruto, BHE_RETENTION_RATE } from "@/lib/bhe";
import { COST_CATEGORIES } from "@/lib/cost-categories";
import { toast } from "sonner";
import {
  ArrowLeft, Pencil, MapPin, Clock, Music4, Wallet, FileText, Link as LinkIcon,
  Plus, Trash2, Star, ExternalLink, Loader2, Lock, LockOpen, Printer, Receipt,
  Ticket, Upload, Paperclip, Share2, Users, RefreshCw, BellRing, Banknote, CheckCircle2, Circle, Mail,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { LiveShow, ShowStatus, SetlistItem, CostItem, TimingItem, TicketTier, EventContact } from "@/types/shows";
import { EventPrintHeader } from "@/components/events/EventPrintHeader";
import { EventPrintFooter } from "@/components/events/EventPrintFooter";
import { compressImage } from "@/lib/image-compress";
import { supabase } from "@/lib/supabase";
import { SignedFileLink } from "@/components/finances/SignedFileLink";

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

// El campo `address` suele venir de Google Places como direccion completa
// (calle, comuna, region, pais...). Para el encabezado de impresion solo
// queremos "calle n°, comuna" -- el primer segmento (antes de la primera
// coma) es la calle+numero, y la comuna ya la tenemos aparte en `city`.
function formatShortAddress(address: string | null, city: string | null): string | null {
  const street = address?.split(",")[0]?.trim() || "";
  const parts = [street, city].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36);
}

type EventDetail = LiveShow & { setlist: SetlistItem[]; costItems: CostItem[]; timing: TimingItem[]; ticketTiers: TicketTier[]; eventContacts: EventContact[]; canViewCosts?: boolean; canEditCosts?: boolean };

interface CostSubmission {
  id: string;
  label: string;
  category: string | null;
  responsable: string | null;
  amount: number;
  comprobanteUrl: string | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  submitterName: string | null;
}

interface Signer {
  userId: string;
  fullName: string | null;
  email: string | null;
}

interface Signature extends Signer {
  signedAt: string;
}

interface SignatureData {
  requiredSigners: Signer[];
  signatures: Signature[];
  allSigned: boolean;
}

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { projects } = useProject();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [notifyingChange, setNotifyingChange] = useState(false);

  const [setlist, setSetlist] = useState<SetlistItem[]>([]);
  const [setlistDirty, setSetlistDirty] = useState(false);
  const [savingSetlist, setSavingSetlist] = useState(false);
  const [newSongTitle, setNewSongTitle] = useState("");

  const [eventContacts, setEventContacts] = useState<EventContact[]>([]);
  const [contactsDirty, setContactsDirty] = useState(false);
  const [savingContacts, setSavingContacts] = useState(false);
  const [newContactRole, setNewContactRole] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newContactId, setNewContactId] = useState<string | null>(null);
  const [newContactPhone, setNewContactPhone] = useState("");
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
  // Descuentos sobre la venta bruta de entradas (IVA/SCD/comisión) + % que
  // le corresponde al proyecto sobre el neto -- ver migración 083. Se
  // guardan como string en el input para permitir "" mientras se edita
  // (null = no configurado, se comporta como antes sin descuentos).
  const [ticketIvaPct, setTicketIvaPct] = useState<string>("");
  const [ticketComisionPct, setTicketComisionPct] = useState<string>("");
  const [ticketScdPct, setTicketScdPct] = useState<string>("");
  const [ticketSplitProjectPct, setTicketSplitProjectPct] = useState<string>("");

  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [costsDirty, setCostsDirty] = useState(false);
  const [savingCosts, setSavingCosts] = useState(false);
  const [profitSplitNote, setProfitSplitNote] = useState("");
  const [profitSplitProjectPct, setProfitSplitProjectPct] = useState<number | null>(null);
  const [profitSplitTrinoPct, setProfitSplitTrinoPct] = useState<number | null>(null);
  const [profitSplitTransferProofUrl, setProfitSplitTransferProofUrl] = useState<string | null>(null);
  const [profitSplitTransferredAt, setProfitSplitTransferredAt] = useState<string | null>(null);
  const [uploadingTransferProof, setUploadingTransferProof] = useState(false);
  const transferProofInputRef = useRef<HTMLInputElement>(null);
  const [signatureData, setSignatureData] = useState<SignatureData | null>(null);
  const [newCostLabel, setNewCostLabel] = useState("");
  const [newCostCategory, setNewCostCategory] = useState<string | null>(null);
  const [newCostAmount, setNewCostAmount] = useState("");
  const [newCostResponsable, setNewCostResponsable] = useState("");
  const [newCostResponsableContactId, setNewCostResponsableContactId] = useState<string | null>(null);
  const [newCostComprobante, setNewCostComprobante] = useState("");
  const [newCostEsBhe, setNewCostEsBhe] = useState(false);
  const [newCostKm, setNewCostKm] = useState<number | null>(null);
  const [newCostKmRate, setNewCostKmRate] = useState<number | null>(null);
  const [closingCosts, setClosingCosts] = useState(false);
  const [informingClosing, setInformingClosing] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const closingFileInputRef = useRef<HTMLInputElement>(null);

  const [costSubmissions, setCostSubmissions] = useState<CostSubmission[]>([]);
  const [canReviewSubmissions, setCanReviewSubmissions] = useState(false);
  const [reviewingSubmissionId, setReviewingSubmissionId] = useState<string | null>(null);

  const costSheetClosed = Boolean(event?.costSheetClosedAt);
  // "artist" ve la Planilla completa (necesita revisarla para poder
  // firmar el cierre) pero no puede tocar nada -- ver src/lib/project-roles.ts.
  const canEditCosts = event?.canEditCosts !== false;

  const [eventLink, setEventLink] = useState("");
  const [riderLocal, setRiderLocal] = useState("");
  const [riderBanda, setRiderBanda] = useState("");
  const [ticketSalesUrl, setTicketSalesUrl] = useState("");
  const [syncingTickets, setSyncingTickets] = useState(false);
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
        setTicketIvaPct(data.ticketIvaPct != null ? String(data.ticketIvaPct) : "");
        setTicketComisionPct(data.ticketComisionPct != null ? String(data.ticketComisionPct) : "");
        setTicketScdPct(data.ticketScdPct != null ? String(data.ticketScdPct) : "");
        setTicketSplitProjectPct(data.ticketSplitProjectPct != null ? String(data.ticketSplitProjectPct) : "");
        setEventContacts(data.eventContacts ?? []);
        setCostItems(data.costItems ?? []);
        setProfitSplitNote(data.profitSplitNote ?? "");
        setProfitSplitProjectPct(data.profitSplitProjectPct ?? null);
        setProfitSplitTrinoPct(data.profitSplitTrinoPct ?? null);
        setProfitSplitTransferProofUrl(data.profitSplitTransferProofUrl ?? null);
        setProfitSplitTransferredAt(data.profitSplitTransferredAt ?? null);
        setEventLink(data.eventLink ?? "");
        setRiderLocal(data.riderLocal ?? "");
        setRiderBanda(data.riderBanda ?? "");
        setTicketSalesUrl(data.ticketSalesUrl ?? "");
        setSetlistDirty(false);
        setCostsDirty(false);
        setTimingDirty(false);
        setTicketsDirty(false);
        setContactsDirty(false);
        setDetailsDirty(false);

        if (data.costSheetClosedAt) {
          fetch(`/api/eventos/${id}/signatures`)
            .then((r) => (r.ok ? r.json() : null))
            .then((sig) => {
              if (!sig) return;
              setSignatureData({
                requiredSigners: sig.requiredSigners,
                signatures: sig.signatures,
                allSigned: sig.allSigned,
              });
            })
            .catch(() => setSignatureData(null));
        } else {
          setSignatureData(null);
        }
      })
      .catch(() => setEvent(null))
      .finally(() => setLoading(false));
  }, [id]);

  const loadCostSubmissions = useCallback(() => {
    fetch(`/api/eventos/${id}/cost-submissions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setCostSubmissions(data.submissions ?? []);
        setCanReviewSubmissions(Boolean(data.canReview));
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    load();
    loadCostSubmissions();
  }, [load, loadCostSubmissions]);

  async function reviewSubmission(submissionId: string, decision: "approve" | "reject", reviewNote?: string) {
    setReviewingSubmissionId(submissionId);
    try {
      const res = await fetch(`/api/eventos/${id}/cost-submissions/${submissionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reviewNote: reviewNote || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "No se pudo revisar el gasto");
        return;
      }
      toast.success(decision === "approve" ? "Gasto aprobado y agregado a la Planilla" : "Gasto rechazado y eliminado");
      loadCostSubmissions();
      if (decision === "approve") load();
    } catch {
      toast.error("No se pudo revisar el gasto");
    } finally {
      setReviewingSubmissionId(null);
    }
  }

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

  async function saveContacts() {
    setSavingContacts(true);
    try {
      const res = await fetch(`/api/eventos/${id}/contacts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: eventContacts.map((c) => ({
            id: c.id.startsWith("tmp-") ? undefined : c.id,
            role: c.role,
            name: c.name,
            contactId: c.contactId,
            phone: c.phone,
            visibleOnShare: c.visibleOnShare,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Contactos guardados");
      load();
    } catch {
      toast.error("No se pudieron guardar los contactos");
    } finally {
      setSavingContacts(false);
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

  // Bruto -> se descuentan IVA/comisión/SCD (cada uno % del bruto, no
  // compuestos) -> Neto -> se reparte el % que le corresponde al
  // proyecto (el resto se lo queda el venue/productora). Si no hay ningún
  // % configurado, montoProyecto = bruto (mismo comportamiento de antes).
  const ticketBreakdown = useMemo(() => {
    const bruto = ticketTiers.reduce((sum, t) => sum + t.unitPrice * t.quantitySold, 0);
    const ivaPct = parseFloat(ticketIvaPct) || 0;
    const comisionPct = parseFloat(ticketComisionPct) || 0;
    const scdPct = parseFloat(ticketScdPct) || 0;
    const splitPct = ticketSplitProjectPct.trim() === "" ? 100 : parseFloat(ticketSplitProjectPct) || 0;
    const descuentos = Math.round(bruto * ((ivaPct + comisionPct + scdPct) / 100));
    const neto = bruto - descuentos;
    const montoProyecto = Math.round(neto * (splitPct / 100));
    const hasDescuentos = ivaPct > 0 || comisionPct > 0 || scdPct > 0 || ticketSplitProjectPct.trim() !== "";
    return { bruto, ivaPct, comisionPct, scdPct, splitPct, descuentos, neto, montoProyecto, hasDescuentos };
  }, [ticketTiers, ticketIvaPct, ticketComisionPct, ticketScdPct, ticketSplitProjectPct]);

  async function applyTicketsToIncome() {
    const { montoProyecto } = ticketBreakdown;
    try {
      const res = await fetch(`/api/eventos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketIncome: montoProyecto,
          ticketIvaPct: ticketIvaPct.trim() === "" ? null : parseFloat(ticketIvaPct),
          ticketComisionPct: ticketComisionPct.trim() === "" ? null : parseFloat(ticketComisionPct),
          ticketScdPct: ticketScdPct.trim() === "" ? null : parseFloat(ticketScdPct),
          ticketSplitProjectPct: ticketSplitProjectPct.trim() === "" ? null : parseFloat(ticketSplitProjectPct),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Entradas del evento actualizadas a ${formatCents(montoProyecto)}`);
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

  async function handleTicketSync() {
    const trimmedUrl = ticketSalesUrl.trim();
    if (!trimmedUrl) {
      toast.error("Pega primero el link de estadísticas de la ticketera");
      return;
    }
    if (ticketsDirty && !confirm("Tienes cambios sin guardar en los tramos -- sincronizar los va a reemplazar. ¿Seguir?")) {
      return;
    }
    setSyncingTickets(true);
    try {
      // Guarda el link de una vez, para no tener que hacerlo aparte.
      await fetch(`/api/eventos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketSalesUrl: trimmedUrl }),
      });

      const res = await fetch("/api/eventos/tickets-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "url", url: trimmedUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "No se pudo sincronizar");
        return;
      }
      const tiers = Array.isArray(data.tiers) ? data.tiers : [];
      if (tiers.length === 0) {
        toast.info("No se encontraron tramos en esa página");
        return;
      }
      // A diferencia del pantallazo (que agrega), sincronizar REEMPLAZA --
      // es justamente para mantener los numeros al dia, no para acumular.
      setTicketTiers(
        tiers.map((t: { label: string; unitPrice: number | null; quantitySold: number | null; capacity: number | null; statusLabel: string | null }, i: number) => ({
          id: `tmp-${newId()}`,
          position: i,
          label: t.label || "Tramo",
          unitPrice: t.unitPrice != null ? Math.round(t.unitPrice * 100) : 0,
          quantitySold: t.quantitySold ?? 0,
          capacity: t.capacity ?? null,
          statusLabel: t.statusLabel ?? null,
        }))
      );
      setTicketsDirty(true);
      toast.success(`${tiers.length} tramo(s) sincronizados -- revisa antes de guardar`);
    } catch {
      toast.error("Error al sincronizar");
    } finally {
      setSyncingTickets(false);
    }
  }

  async function saveCosts() {
    setSavingCosts(true);
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
        fetch(`/api/eventos/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profitSplitNote: profitSplitNote.trim() || null,
            profitSplitProjectPct,
            profitSplitTrinoPct,
          }),
        }),
      ]);
      if (!itemsRes.ok || !noteRes.ok) throw new Error();
      toast.success("Costos guardados");
      load();
    } catch {
      toast.error("No se pudieron guardar los costos");
    } finally {
      setSavingCosts(false);
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

  async function saveDetails() {
    setSavingDetails(true);
    try {
      const res = await fetch(`/api/eventos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventLink: eventLink || null, riderLocal: riderLocal || null, riderBanda: riderBanda || null, ticketSalesUrl: ticketSalesUrl || null }),
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

  // Comprobante de la transferencia del reparto de utilidad -- pensado
  // como el paso final del evento, después de que todos firmaron: se
  // sube la captura/PDF de la transferencia y queda marcado como
  // transferido, con fecha.
  async function handleTransferProofChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("El archivo no puede superar 25 MB");
      return;
    }
    setUploadingTransferProof(true);
    try {
      const ext = file.name.split(".").pop();
      const storagePath = `profit-split/${id}/${Date.now()}.${ext}`;
      const uploadResult = await supabase.storage.from("finances").upload(storagePath, file, { upsert: false });
      if (uploadResult.error) {
        toast.error("Error subiendo el archivo: " + uploadResult.error.message);
        return;
      }
      const { data } = supabase.storage.from("finances").getPublicUrl(storagePath);
      const transferredAt = new Date().toISOString();
      const res = await fetch(`/api/eventos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profitSplitTransferProofUrl: data.publicUrl,
          profitSplitTransferredAt: transferredAt,
        }),
      });
      if (!res.ok) throw new Error();
      setProfitSplitTransferProofUrl(data.publicUrl);
      setProfitSplitTransferredAt(transferredAt);
      toast.success("Comprobante de transferencia guardado -- evento cerrado");
    } catch {
      toast.error("No se pudo subir el comprobante");
    } finally {
      setUploadingTransferProof(false);
    }
  }

  function printSection(section: "costs" | "timing" | "setlist" | "contacts" | "todo") {
    document.body.setAttribute("data-print-section", section);

    // El navegador usa document.title como nombre por defecto al Guardar
    // como PDF -- para Costos (la hoja de cierre) se pone YYMMDD - Cierre
    // [evento] para que quede prolijo y ordenado por fecha al guardarlo.
    // Se restaura el titulo real de la pagina despues de imprimir.
    const originalTitle = document.title;
    if (section === "costs" && event) {
      try {
        const datePrefix = format(new Date(`${event.date}T00:00:00`), "yyMMdd");
        document.title = `${datePrefix} - Cierre ${event.name}`;
      } catch {
        // Si la fecha viene rara, mejor no tocar el titulo que romper el print.
      }
    }

    window.print();
    document.title = originalTitle;
  }

  async function handleCopyShareLink() {
    const url = `${window.location.origin}/e/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado -- se puede abrir sin cuenta (ve encabezado, timing, setlist y riders)");
    } catch {
      toast.info(url);
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

  async function handleNotifyChanges() {
    setNotifyingChange(true);
    try {
      const res = await fetch(`/api/eventos/${id}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo notificar");
      if (data.notified === 0) {
        toast.info("Nadie más en el proyecto tiene notificaciones activadas todavía");
      } else {
        toast.success(`Notificación enviada a ${data.notified} persona${data.notified === 1 ? "" : "s"} del proyecto`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al notificar");
    } finally {
      setNotifyingChange(false);
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

  // Manda el resumen del cierre por correo a todos los que firmaron --
  // solo se puede llamar cuando allSigned es true (el botón que lo dispara
  // ya está deshabilitado antes de eso, pero el servidor lo revalida igual).
  // No es de un solo uso: se puede volver a apretar para reenviar.
  async function informClosing() {
    const already = Boolean(event?.costSheetInformedAt);
    if (!confirm(already ? "¿Reenviar el resumen del cierre a todos los que firmaron?" : "¿Informar el cierre? Se les manda por correo el resumen completo a todos los que firmaron.")) return;
    setInformingClosing(true);
    try {
      const res = await fetch(`/api/eventos/${id}/costs/inform`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo informar el cierre");
      toast.success(`Cierre informado a ${data.sentTo?.length ?? 0} persona(s)`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo informar el cierre");
    } finally {
      setInformingClosing(false);
    }
  }

  async function handleClosingAttachmentUpload(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("El archivo no puede superar 10 MB");
      return;
    }
    setUploadingAttachment(true);
    try {
      const ext = file.name.split(".").pop();
      const storagePath = `event-closings/${id}/${Date.now()}.${ext}`;
      const uploadResult = await supabase.storage.from("finances").upload(storagePath, file, { upsert: false });
      if (uploadResult.error) {
        toast.error("Error subiendo el archivo: " + uploadResult.error.message);
        return;
      }
      const res = await fetch(`/api/eventos/${id}/costs/attachment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: storagePath, fileName: file.name }),
      });
      if (!res.ok) throw new Error();
      toast.success("Documento adjuntado");
      load();
    } catch {
      toast.error("No se pudo adjuntar el documento");
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function handleRemoveClosingAttachment() {
    if (!confirm("¿Quitar el documento adjunto del cierre?")) return;
    try {
      const res = await fetch(`/api/eventos/${id}/costs/attachment`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Documento quitado");
      load();
    } catch {
      toast.error("No se pudo quitar el documento");
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
  // Default 70/30 si no se ha tocado el reparto de este evento puntual.
  const resolvedProjectPct = profitSplitProjectPct ?? 70;
  const resolvedTrinoPct = profitSplitTrinoPct ?? 30;
  const projectSplitCents = Math.round((utilidadCents * resolvedProjectPct) / 100);
  const trinoSplitCents = Math.round((utilidadCents * resolvedTrinoPct) / 100);
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
          [data-section="header"], [data-section="footer"] { display: none !important; }
          body[data-print-section="todo"] [data-section] { display: block !important; }
          body[data-print-section="todo"] [data-section="header"],
          body[data-print-section="todo"] [data-section="footer"] { display: flex !important; }
          body[data-print-section="costs"] [data-section="header"],
          body[data-print-section="costs"] [data-section="footer"] { display: flex !important; }
          body[data-print-section="costs"] [data-section="summary"],
          body[data-print-section="costs"] [data-section="costs"] { display: block !important; }
          body[data-print-section="timing"] [data-section="header"],
          body[data-print-section="timing"] [data-section="footer"] { display: flex !important; }
          body[data-print-section="timing"] [data-section="timing"] { display: block !important; }
          body[data-print-section="setlist"] [data-section="header"],
          body[data-print-section="setlist"] [data-section="footer"] { display: flex !important; }
          body[data-print-section="setlist"] [data-section="setlist"] { display: block !important; }
          body[data-print-section="contacts"] [data-section="header"],
          body[data-print-section="contacts"] [data-section="footer"] { display: flex !important; }
          body[data-print-section="contacts"] [data-section="contacts"] { display: block !important; }
          /* El reset generico de arriba (a block) rompe el grid de 4
             columnas del resumen financiero -- se lo restaura a proposito
             en los 2 modos donde aparece (todo/costs). Tiene que calzar
             la MISMA especificidad que las reglas de arriba (body[data-
             print-section="x"] [data-section]) para ganarles -- un
             selector [data-section="summary"] suelto pierde contra esas
             aunque venga despues en el archivo, porque en CSS ante un
             empate de !important manda la especificidad, no el orden. */
          body[data-print-section="todo"] [data-section="summary"],
          body[data-print-section="costs"] [data-section="summary"] {
            display: grid !important;
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 0.4rem !important;
          }
        }
      `}</style>

      <button
        onClick={() => router.push("/eventos")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer no-print"
      >
        <ArrowLeft className="h-4 w-4" />
        Eventos
      </button>

      <div className="flex flex-col gap-3 no-print">
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={handleCopyShareLink} title="Compartir">
            <Share2 className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Compartir</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="cursor-pointer"
            onClick={handleNotifyChanges}
            disabled={notifyingChange}
            title="Avisar al proyecto que algo cambió en este evento"
          >
            {notifyingChange ? <Loader2 className="h-4 w-4 sm:mr-1.5 animate-spin" /> : <BellRing className="h-4 w-4 sm:mr-1.5" />}
            <span className="hidden sm:inline">Notificar cambios</span>
          </Button>
          {event.status === "realizado" && (
            <Button size="sm" variant="outline" className="cursor-pointer" onClick={handleCopyRatingLink} title="Link de valoración">
              <Star className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Link de valoración</span>
            </Button>
          )}
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => printSection("todo")} title="Imprimir todo">
            <Printer className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Imprimir todo</span>
          </Button>
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setEditOpen(true)} title="Editar">
            <Pencil className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Editar</span>
          </Button>
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight leading-tight">{event.name}</h1>
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
      </div>

      {/* Encabezado compartido por todas las impresiones -- logo/avatar del
          proyecto (o el que sincroniza Instagram si no hay uno subido a mano),
          nombre del proyecto, nombre y fecha del evento. */}
      <EventPrintHeader
        projectName={event.projectName}
        projectAvatarUrl={eventProject?.avatarUrl ?? null}
        eventName={event.name}
        eventDateLabel={`${formatDate(event.date)} · ${event.venue}`}
        addressLine={formatShortAddress(event.address, event.city)}
      />

      {/* Resumen financiero -- oculto para roles restringidos (artist/staff),
          ver canViewCosts en GET /api/eventos/[id]. */}
      {event.canViewCosts !== false && (
        <div className="grid grid-cols-4 gap-3" data-section="summary">
          <Card><CardContent className="p-3 print:p-1.5"><p className="text-xs print:text-[9px] text-muted-foreground">Fee</p><p className="font-semibold print:text-xs print:whitespace-nowrap">{formatCents(event.fee)}</p></CardContent></Card>
          <Card><CardContent className="p-3 print:p-1.5"><p className="text-xs print:text-[9px] text-muted-foreground">Entradas</p><p className="font-semibold print:text-xs print:whitespace-nowrap">{formatCents(event.ticketIncome)}</p></CardContent></Card>
          <Card><CardContent className="p-3 print:p-1.5"><p className="text-xs print:text-[9px] text-muted-foreground">Egresos</p><p className="font-semibold print:text-xs print:whitespace-nowrap">{formatCents(event.expenses)}</p></CardContent></Card>
          <Card>
            <CardContent className="p-3 print:p-1.5">
              <p className="text-xs print:text-[9px] text-muted-foreground">Utilidad</p>
              <p className={`font-semibold print:text-xs print:whitespace-nowrap ${utilidadCents >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                {formatCents(utilidadCents)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Contactos importantes */}
      <Card data-section="contacts">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            Contactos importantes
          </CardTitle>
          <div className="flex items-center gap-2 no-print">
            {contactsDirty && (
              <Button size="sm" className="h-7 text-xs cursor-pointer" disabled={savingContacts} onClick={saveContacts}>
                {savingContacts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar contactos"}
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" onClick={() => printSection("contacts")} title="Imprimir">
              <Printer className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Imprimir</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Version limpia, solo para imprimir -- sin inputs editables */}
          {eventContacts.length > 0 && (
            <table className="hidden print:table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="text-left py-1 pr-3 font-medium">Cargo</th>
                  <th className="text-left py-1 pr-3 font-medium">Nombre</th>
                  <th className="text-left py-1 font-medium">Teléfono</th>
                </tr>
              </thead>
              <tbody>
                {eventContacts.map((c) => (
                  <tr key={c.id} className="border-b border-slate-200">
                    <td className="py-1 pr-3">{c.role || "—"}</td>
                    <td className="py-1 pr-3">{c.name}</td>
                    <td className="py-1">{c.phone || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="no-print space-y-3">
            {eventContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sin contactos agregados todavía -- ej. manager, productor, encargado técnico, tour manager.
              </p>
            ) : (
              <SortableList
                items={eventContacts}
                onReorder={(items) => { setEventContacts(items); setContactsDirty(true); }}
                renderItem={(c) => {
                  function updateContact(patch: Partial<EventContact>) {
                    setEventContacts((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));
                    setContactsDirty(true);
                  }
                  return (
                    <div className="flex items-center gap-2 flex-wrap">
                      <TypeaheadInput
                        placeholder="Nombre"
                        value={c.name}
                        onChange={(v) => updateContact({ name: v, contactId: null })}
                        onSelectSuggestion={(s) => updateContact({ name: s.label, contactId: s.value ?? null })}
                        fetchSuggestions={fetchResponsableSuggestions}
                        className="h-7 text-xs w-full sm:flex-1 sm:w-auto sm:order-2"
                      />
                      <Input
                        placeholder="Cargo (ej. Manager)"
                        value={c.role ?? ""}
                        onChange={(e) => updateContact({ role: e.target.value })}
                        className="h-7 text-xs w-24 sm:w-40 shrink-0 sm:order-1"
                      />
                      <Input
                        placeholder="Teléfono"
                        value={c.phone ?? ""}
                        onChange={(e) => updateContact({ phone: e.target.value })}
                        className="h-7 text-xs w-24 sm:w-36 shrink-0"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 cursor-pointer" title="Aparece en el link público">
                        <Checkbox checked={c.visibleOnShare} onCheckedChange={(v) => updateContact({ visibleOnShare: Boolean(v) })} />
                        <Share2 className="h-3.5 w-3.5" />
                      </label>
                      <button
                        onClick={() => {
                          setEventContacts((prev) => prev.filter((x) => x.id !== c.id));
                          setContactsDirty(true);
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

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <TypeaheadInput
                placeholder="Nombre"
                value={newContactName}
                onChange={(v) => { setNewContactName(v); setNewContactId(null); }}
                onSelectSuggestion={(s) => { setNewContactName(s.label); setNewContactId(s.value ?? null); }}
                fetchSuggestions={fetchResponsableSuggestions}
                className="h-7 text-xs w-full sm:flex-1 sm:w-auto sm:order-2"
              />
              <Input
                placeholder="Cargo nuevo"
                value={newContactRole}
                onChange={(e) => setNewContactRole(e.target.value)}
                className="h-7 text-xs w-24 sm:w-40 shrink-0 sm:order-1"
              />
              <Input
                placeholder="Teléfono"
                value={newContactPhone}
                onChange={(e) => setNewContactPhone(e.target.value)}
                className="h-7 text-xs w-24 sm:w-36 shrink-0"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0 cursor-pointer"
                disabled={!newContactName.trim()}
                onClick={() => {
                  setEventContacts((prev) => [
                    ...prev,
                    {
                      id: `tmp-${newId()}`,
                      position: prev.length,
                      role: newContactRole || null,
                      name: newContactName.trim(),
                      contactId: newContactId,
                      phone: newContactPhone || null,
                      visibleOnShare: false,
                    },
                  ]);
                  setNewContactRole("");
                  setNewContactName("");
                  setNewContactId(null);
                  setNewContactPhone("");
                  setContactsDirty(true);
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Share2 className="h-3 w-3" />
              El ícono marca si ese contacto aparece en el link público del evento (por defecto, no).
            </p>
          </div>
        </CardContent>
      </Card>

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
              {extractingSetlist ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" /> : <Upload className="h-3.5 w-3.5 sm:mr-1" />}
              <span className="hidden sm:inline">{extractingSetlist ? "Leyendo..." : "Subir archivo"}</span>
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" onClick={() => printSection("setlist")} title="Imprimir">
              <Printer className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Imprimir</span>
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
                      className="h-8 text-sm"
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
                className="h-8 text-sm"
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
              {extractingTiming ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" /> : <Upload className="h-3.5 w-3.5 sm:mr-1" />}
              <span className="hidden sm:inline">{extractingTiming ? "Leyendo..." : "Subir archivo"}</span>
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" onClick={() => printSection("timing")} title="Imprimir">
              <Printer className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Imprimir</span>
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
                        className="h-7 text-xs w-20 sm:w-40 shrink-0"
                      />
                      <Input
                        placeholder="Detalle / actividad"
                        value={item.activity}
                        onChange={(e) => updateTimingItem({ activity: e.target.value })}
                        className="h-7 text-xs flex-1"
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
                    <div className="flex items-center gap-2 pl-0.5 flex-wrap">
                      <TypeaheadInput
                        placeholder="Responsable"
                        value={item.responsable ?? ""}
                        onChange={(v) => updateTimingItem({ responsable: v, responsableContactId: null })}
                        onSelectSuggestion={(s) => updateTimingItem({ responsable: s.label, responsableContactId: s.value ?? null })}
                        fetchSuggestions={fetchResponsableSuggestions}
                        className="h-7 text-xs w-24 sm:w-48 shrink-0"
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
              <Input
                placeholder="Hora"
                value={newTimeLabel}
                onChange={(e) => setNewTimeLabel(e.target.value)}
                className="h-7 text-xs w-20 sm:w-40 shrink-0"
              />
              <Input
                placeholder="Detalle / actividad"
                value={newActivity}
                onChange={(e) => setNewActivity(e.target.value)}
                className="h-7 text-xs flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <TypeaheadInput
                placeholder="Responsable"
                value={newTimingResponsable}
                onChange={(v) => { setNewTimingResponsable(v); setNewTimingResponsableContactId(null); }}
                onSelectSuggestion={(s) => { setNewTimingResponsable(s.label); setNewTimingResponsableContactId(s.value ?? null); }}
                fetchSuggestions={fetchResponsableSuggestions}
                className="h-7 text-xs w-24 sm:w-48 shrink-0"
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
              {extractingTickets ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" /> : <Upload className="h-3.5 w-3.5 sm:mr-1" />}
              <span className="hidden sm:inline">{extractingTickets ? "Leyendo..." : "Subir pantallazo"}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 no-print">
            <Input
              placeholder="Link de estadísticas de la ticketera (PortalTickets, etc.)"
              value={ticketSalesUrl}
              onChange={(e) => setTicketSalesUrl(e.target.value)}
              className="h-8 text-sm flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs cursor-pointer shrink-0"
              disabled={syncingTickets}
              onClick={handleTicketSync}
            >
              {syncingTickets ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" /> : <RefreshCw className="h-3.5 w-3.5 sm:mr-1" />}
              <span className="hidden sm:inline">{syncingTickets ? "Sincronizando..." : "Sincronizar"}</span>
            </Button>
          </div>

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
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      placeholder="Tramo (ej. Preventa 1)"
                      value={tier.label}
                      onChange={(e) => updateTier({ label: e.target.value })}
                      className="h-7 text-xs w-full sm:flex-1 sm:w-auto"
                    />
                    <div className="w-20 sm:w-28 shrink-0">
                      <MoneyInput
                        placeholder="Precio"
                        value={tier.unitPrice ? String(tier.unitPrice / 100) : ""}
                        onChange={(digits) => updateTier({ unitPrice: digits ? parseInt(digits, 10) * 100 : 0 })}
                        className="h-7 text-xs"
                      />
                    </div>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="Vendidas"
                      value={tier.quantitySold || ""}
                      onChange={(e) => updateTier({ quantitySold: parseInt(e.target.value, 10) || 0 })}
                      className="h-7 text-xs w-16 sm:w-24 shrink-0"
                    />
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="Cupos"
                      value={tier.capacity ?? ""}
                      onChange={(e) => updateTier({ capacity: e.target.value ? parseInt(e.target.value, 10) : null })}
                      className="h-7 text-xs w-14 sm:w-20 shrink-0"
                    />
                    <Input
                      placeholder="Estado"
                      value={tier.statusLabel ?? ""}
                      onChange={(e) => updateTier({ statusLabel: e.target.value || null })}
                      className="h-7 text-xs w-16 sm:w-28 shrink-0"
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

          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Input
              placeholder="Tramo nuevo"
              value={newTierLabel}
              onChange={(e) => setNewTierLabel(e.target.value)}
              className="h-7 text-xs w-full sm:flex-1 sm:w-auto"
            />
            <div className="w-20 sm:w-28 shrink-0">
              <MoneyInput placeholder="Precio" value={newTierPrice} onChange={setNewTierPrice} className="h-7 text-xs" />
            </div>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Vendidas"
              value={newTierQty}
              onChange={(e) => setNewTierQty(e.target.value)}
              className="h-7 text-xs w-16 sm:w-24 shrink-0"
            />
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Cupos"
              value={newTierCapacity}
              onChange={(e) => setNewTierCapacity(e.target.value)}
              className="h-7 text-xs w-14 sm:w-20 shrink-0"
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

          {ticketTiers.length > 0 && canEditCosts && (
            <div className="border-t pt-3 space-y-2 no-print">
              <p className="text-xs font-medium text-muted-foreground">
                Descuentos sobre la venta (opcional -- se configuran evento a evento)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">IVA %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="19"
                    value={ticketIvaPct}
                    onChange={(e) => setTicketIvaPct(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Comisión venta %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="2,5"
                    value={ticketComisionPct}
                    onChange={(e) => setTicketComisionPct(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Derechos SCD %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="5"
                    value={ticketScdPct}
                    onChange={(e) => setTicketScdPct(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    % que llega a {event.projectName || "el proyecto"}
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="70"
                    value={ticketSplitProjectPct}
                    onChange={(e) => setTicketSplitProjectPct(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              {ticketBreakdown.hasDescuentos && (
                <div className="text-xs text-muted-foreground space-y-0.5 bg-muted/40 rounded-md p-2">
                  <p>Bruto: <span className="font-medium text-foreground">{formatCents(ticketBreakdown.bruto)}</span></p>
                  <p>
                    Descuentos ({(ticketBreakdown.ivaPct + ticketBreakdown.comisionPct + ticketBreakdown.scdPct).toFixed(1)}%):{" "}
                    <span className="font-medium text-foreground">-{formatCents(ticketBreakdown.descuentos)}</span>
                  </p>
                  <p>Neto: <span className="font-medium text-foreground">{formatCents(ticketBreakdown.neto)}</span></p>
                  <p>
                    {event.projectName || "Proyecto"} ({ticketBreakdown.splitPct}%):{" "}
                    <span className="font-semibold text-foreground">{formatCents(ticketBreakdown.montoProyecto)}</span>
                    {ticketBreakdown.splitPct < 100 && (
                      <span className="text-muted-foreground"> · venue/productora ({(100 - ticketBreakdown.splitPct).toFixed(1)}%): {formatCents(ticketBreakdown.neto - ticketBreakdown.montoProyecto)}</span>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          {ticketTiers.length > 0 && (
            <div className="flex items-center justify-between border-t pt-2">
              <p className="text-sm text-muted-foreground">
                {ticketTiers.reduce((sum, t) => sum + t.quantitySold, 0)} entradas vendidas · Total:{" "}
                <span className="font-semibold text-foreground">
                  {formatCents(ticketBreakdown.bruto)}
                </span>
                {ticketBreakdown.hasDescuentos && (
                  <>
                    {" "}· Neto a {event.projectName || "proyecto"}:{" "}
                    <span className="font-semibold text-foreground">{formatCents(ticketBreakdown.montoProyecto)}</span>
                  </>
                )}
              </p>
              <Button size="sm" variant="ghost" className="h-7 text-xs cursor-pointer no-print" onClick={applyTicketsToIncome}>
                Usar como Entradas del evento
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Costos -- Card completa oculta para roles restringidos (artist/staff),
          ver canViewCosts en GET /api/eventos/[id]. */}
      {event.canViewCosts !== false && (
      <Card data-section="costs">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
            <Wallet className="h-4 w-4 shrink-0" />
            Planilla de costos
            {costSheetClosed && (
              <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-700 ml-1">
                <Lock className="h-3 w-3 mr-1" />
                Cerrada
              </Badge>
            )}
            {signatureData && (
              <Badge
                variant="secondary"
                className={`text-xs ml-1 ${signatureData.allSigned ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
              >
                {signatureData.allSigned
                  ? "Aprobado por todos"
                  : `Pendiente de aprobación (${signatureData.requiredSigners.filter((r) => signatureData.signatures.some((s) => s.userId === r.userId)).length}/${signatureData.requiredSigners.length})`}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2 no-print flex-wrap">
            {canEditCosts && costsDirty && (
              <Button size="sm" className="h-7 text-xs cursor-pointer" disabled={savingCosts} onClick={saveCosts}>
                {savingCosts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar costos"}
              </Button>
            )}
            {canEditCosts && (
              <>
                <input
                  ref={closingFileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleClosingAttachmentUpload(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs cursor-pointer"
                  disabled={uploadingAttachment}
                  onClick={() => closingFileInputRef.current?.click()}
                  title="Adjuntar documento"
                >
                  {uploadingAttachment ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" /> : <Paperclip className="h-3.5 w-3.5 sm:mr-1" />}
                  <span className="hidden sm:inline">{uploadingAttachment ? "Subiendo..." : "Adjuntar documento"}</span>
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" onClick={() => printSection("costs")} title="Imprimir">
              <Printer className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Imprimir</span>
            </Button>
            {canEditCosts && !costSheetClosed && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs cursor-pointer no-print"
                onClick={async () => {
                  const url = `${window.location.origin}/eventos/${id}/gastos`;
                  try {
                    await navigator.clipboard.writeText(url);
                    toast.success("Link copiado -- solo lo pueden abrir los integrantes de este proyecto (con su cuenta)");
                  } catch {
                    toast.info(url);
                  }
                }}
                title="Copiar link para que reporten sus gastos"
              >
                <Share2 className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Link para gastos</span>
              </Button>
            )}
            {canEditCosts && (costSheetClosed ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs cursor-pointer"
                  onClick={async () => {
                    const url = `${window.location.origin}/eventos/${id}/firmar`;
                    try {
                      await navigator.clipboard.writeText(url);
                      toast.success("Link copiado -- solo lo pueden abrir los integrantes de este proyecto (con su cuenta)");
                    } catch {
                      toast.info(url);
                    }
                  }}
                  title="Copiar link para que el equipo apruebe el cierre"
                >
                  <Share2 className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Link de firma</span>
                </Button>
                {signatureData?.allSigned && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs cursor-pointer"
                    disabled={informingClosing}
                    onClick={informClosing}
                    title={event.costSheetInformedAt ? `Informado el ${format(new Date(event.costSheetInformedAt), "d MMM yyyy, HH:mm", { locale: es })} -- click para reenviar` : "Mandar el resumen del cierre por correo a todos los que firmaron"}
                  >
                    {informingClosing ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" /> : <Mail className="h-3.5 w-3.5 sm:mr-1" />}
                    <span className="hidden sm:inline">{event.costSheetInformedAt ? "Reenviar informe" : "Informar cierre"}</span>
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" disabled={closingCosts} onClick={reopenCostSheet} title="Reabrir">
                  <LockOpen className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Reabrir</span>
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" disabled={closingCosts} onClick={closeCostSheet} title="Cerrar caja">
                <Lock className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Cerrar caja</span>
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {costSheetClosed && (
            <p className="text-xs text-muted-foreground no-print">
              Caja cerrada{event.costSheetClosedAt ? ` el ${format(new Date(event.costSheetClosedAt), "d MMM yyyy, HH:mm", { locale: es })}` : ""}.
              Reábrela si necesitas corregir algo.
              {event.costSheetInformedAt && (
                <> Cierre informado por correo el {format(new Date(event.costSheetInformedAt), "d MMM yyyy, HH:mm", { locale: es })}.</>
              )}
            </p>
          )}

          {event.costSheetClosingFilePath && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 no-print">
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <SignedFileLink
                path={event.costSheetClosingFilePath}
                className="text-xs text-primary hover:underline truncate"
              >
                {event.costSheetClosingFileName ?? "Documento adjunto"}
              </SignedFileLink>
              <button
                onClick={handleRemoveClosingAttachment}
                className="text-muted-foreground hover:text-destructive cursor-pointer ml-auto shrink-0"
                title="Quitar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Colores hardcodeados a propósito (no text-foreground/text-muted-foreground):
              este panel siempre se ve sobre fondo claro (amber/blanco), pero esos son
              variables de tema -- en modo oscuro resuelven a un color casi blanco y el
              texto queda invisible sobre el fondo claro. Mismo tipo de bug que el de los
              tooltips de los gráficos (ver BITACORA). */}
          {canReviewSubmissions && costSubmissions.some((s) => s.status === "pending") && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 space-y-2 no-print">
              <p className="text-xs font-medium text-amber-900">Gastos reportados pendientes de aprobar</p>
              {costSubmissions
                .filter((s) => s.status === "pending")
                .map((s) => (
                  <div key={s.id} className="flex items-start justify-between gap-2 bg-white rounded-md p-2 border border-amber-200">
                    <div className="min-w-0 text-xs space-y-0.5">
                      <p className="font-medium text-slate-900">{s.label} · {formatCents(s.amount)}</p>
                      <p className="text-slate-500">
                        {format(new Date(s.createdAt), "d MMM yyyy, HH:mm", { locale: es })}
                      </p>
                      <p className="text-slate-600">
                        {s.category ? <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 mr-1 text-slate-700">{s.category}</span> : null}
                        Reportado por {s.submitterName ?? "alguien"}{s.responsable ? ` · Responsable: ${s.responsable}` : ""}
                      </p>
                      {s.notes && <p className="text-slate-500 italic">{s.notes}</p>}
                      {s.comprobanteUrl && (
                        <SignedFileLink path={s.comprobanteUrl} className="text-emerald-700 hover:underline inline-flex items-center gap-1 mt-0.5">
                          <Receipt className="h-3 w-3" /> Ver comprobante
                        </SignedFileLink>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs cursor-pointer border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        disabled={reviewingSubmissionId === s.id}
                        onClick={() => {
                          const note = window.prompt(
                            `¿Rechazar "${s.label}" (${formatCents(s.amount)})? Este envío se elimina y ${s.submitterName ?? "quien lo reportó"} puede volver a enviarlo corregido.\n\nMotivo (opcional, se le avisa a la persona):`,
                            ""
                          );
                          if (note === null) return;
                          void reviewSubmission(s.id, "reject", note);
                        }}
                      >
                        Rechazar
                      </Button>
                      <Button
                        size="sm"
                        className="h-6 px-2 text-xs cursor-pointer"
                        disabled={reviewingSubmissionId === s.id}
                        onClick={() => reviewSubmission(s.id, "approve")}
                      >
                        {reviewingSubmissionId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Aprobar"}
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {costItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin items de costo agregados todavía.</p>
          ) : (
            <table className="hidden print:table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="text-left py-1 pr-3 font-medium">Detalle</th>
                  <th className="text-left py-1 pr-3 font-medium">Categoría</th>
                  <th className="text-left py-1 pr-3 font-medium">Responsable</th>
                  <th className="text-right py-1 pr-3 font-medium">Monto</th>
                  <th className="text-left py-1 font-medium">Pagado</th>
                </tr>
              </thead>
              <tbody>
                {costItems.map((item) => (
                  <tr key={item.id} className="border-b border-slate-200">
                    <td className="py-1 pr-3">{item.label}</td>
                    <td className="py-1 pr-3">{item.category || "—"}</td>
                    <td className="py-1 pr-3">{item.responsable || "—"}</td>
                    <td className="py-1 pr-3 text-right">{formatCents(item.amount)}</td>
                    <td className="py-1">{item.pagado ? "Sí" : "No"}</td>
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
                    <TypeaheadInput
                      placeholder="Detalle (ej. Pago sonidista)"
                      value={item.label}
                      disabled={costSheetClosed || !canEditCosts}
                      onChange={(v) => updateItem({ label: v })}
                      fetchSuggestions={fetchCostTypeSuggestions}
                      className="h-7 text-xs w-full"
                    />
                    <div className="flex items-center gap-2">
                      <Select
                        value={item.category ?? undefined}
                        onValueChange={(v) => updateItem({ category: v ?? null })}
                        disabled={costSheetClosed || !canEditCosts}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                          <SelectValue placeholder="Categoría">{item.category ?? "Categoría"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {COST_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="w-20 sm:w-28 shrink-0">
                        <MoneyInput
                          placeholder={item.esBhe ? "Líquido" : "$0"}
                          value={displayAmount ? String(displayAmount / 100) : ""}
                          disabled={costSheetClosed || !canEditCosts}
                          onChange={(digits) => {
                            const cents = digits ? parseInt(digits, 10) * 100 : 0;
                            if (item.esBhe) {
                              updateItem({ liquidoAmount: cents, amount: liquidoToBruto(cents) });
                            } else {
                              updateItem({ amount: cents });
                            }
                          }}
                          className="h-7 text-xs"
                        />
                      </div>
                      <button
                        onClick={() => {
                          setCostItems((prev) => prev.filter((c) => c.id !== item.id));
                          setCostsDirty(true);
                        }}
                        disabled={costSheetClosed || !canEditCosts}
                        className="text-muted-foreground hover:text-destructive cursor-pointer p-1 shrink-0 disabled:opacity-30 no-print"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {item.category === "Bencina" && (
                      <div className="no-print">
                        <BencinaCalculator
                          km={item.km}
                          kmRate={item.kmRate}
                          disabled={costSheetClosed || !canEditCosts}
                          onChange={({ km, kmRate, amountCents }) =>
                            updateItem({
                              km,
                              kmRate,
                              ...(amountCents != null ? { amount: amountCents } : {}),
                            })
                          }
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-2 pl-0.5 flex-wrap">
                      <TypeaheadInput
                        placeholder="Responsable (a quién se le paga)"
                        value={item.responsable ?? ""}
                        disabled={costSheetClosed || !canEditCosts}
                        onChange={(v) => updateItem({ responsable: v, responsableContactId: null })}
                        onSelectSuggestion={(s) => updateItem({ responsable: s.label, responsableContactId: s.value ?? null })}
                        fetchSuggestions={fetchResponsableSuggestions}
                        className="h-7 text-xs flex-1"
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          className="hidden"
                          id={`comprobante-upload-${item.id}`}
                          disabled={costSheetClosed || !canEditCosts}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (!file) return;
                            if (file.size > 25 * 1024 * 1024) {
                              toast.error("El archivo no puede superar 25 MB");
                              return;
                            }
                            try {
                              const ext = file.name.split(".").pop();
                              const storagePath = `cost-items/${id}/${item.id}-${Date.now()}.${ext}`;
                              const uploadResult = await supabase.storage.from("finances").upload(storagePath, file, { upsert: false });
                              if (uploadResult.error) {
                                toast.error("Error subiendo el archivo: " + uploadResult.error.message);
                                return;
                              }
                              const { data } = supabase.storage.from("finances").getPublicUrl(storagePath);
                              updateItem({ comprobanteUrl: data.publicUrl });
                              toast.success("Comprobante adjuntado");
                            } catch {
                              toast.error("No se pudo subir el archivo");
                            }
                          }}
                        />
                        <label
                          htmlFor={`comprobante-upload-${item.id}`}
                          className={`text-muted-foreground hover:text-foreground no-print ${(costSheetClosed || !canEditCosts) ? "opacity-40 pointer-events-none" : "cursor-pointer"}`}
                          title="Subir comprobante (foto o PDF)"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                        </label>
                        {item.comprobanteUrl && (
                          <SignedFileLink path={item.comprobanteUrl} className="text-muted-foreground hover:text-foreground">
                            <Receipt className="h-3.5 w-3.5" />
                          </SignedFileLink>
                        )}
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 cursor-pointer no-print">
                        <Checkbox
                          checked={item.esBhe}
                          disabled={costSheetClosed || !canEditCosts}
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

                    {/* Pago del ítem: el comprobante de arriba es la boleta/factura del
                        GASTO (cuánto se debe); este es distinto -- comprobante de que
                        YA SE LE PAGÓ (ej. captura de la transferencia), llega después. */}
                    <div className="flex items-center gap-2 pl-0.5 flex-wrap no-print">
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 cursor-pointer">
                        <Checkbox
                          checked={item.pagado}
                          disabled={!canEditCosts}
                          onCheckedChange={(checked) => updateItemPayment(item.id, { pagado: Boolean(checked) })}
                        />
                        Pagado
                      </label>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        className="hidden"
                        id={`comprobante-pago-upload-${item.id}`}
                        disabled={!canEditCosts}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          if (file.size > 25 * 1024 * 1024) {
                            toast.error("El archivo no puede superar 25 MB");
                            return;
                          }
                          try {
                            const ext = file.name.split(".").pop();
                            const storagePath = `cost-items/${id}/${item.id}-pago-${Date.now()}.${ext}`;
                            const uploadResult = await supabase.storage.from("finances").upload(storagePath, file, { upsert: false });
                            if (uploadResult.error) {
                              toast.error("Error subiendo el archivo: " + uploadResult.error.message);
                              return;
                            }
                            const { data } = supabase.storage.from("finances").getPublicUrl(storagePath);
                            await updateItemPayment(item.id, { comprobantePagoUrl: data.publicUrl, pagado: true });
                            toast.success("Comprobante de pago adjuntado");
                          } catch {
                            toast.error("No se pudo subir el archivo");
                          }
                        }}
                      />
                      <label
                        htmlFor={`comprobante-pago-upload-${item.id}`}
                        className={`flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ${!canEditCosts ? "opacity-40 pointer-events-none" : "cursor-pointer"}`}
                        title="Subir comprobante de transferencia"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        {item.comprobantePagoUrl ? "Cambiar comprobante de pago" : "Adjuntar comprobante de pago"}
                      </label>
                      {item.comprobantePagoUrl && (
                        <SignedFileLink path={item.comprobantePagoUrl} className="text-muted-foreground hover:text-foreground" title="Ver comprobante de pago">
                          <Banknote className="h-3.5 w-3.5" />
                        </SignedFileLink>
                      )}
                    </div>
                  </div>
                );
              }}
            />
          )}

          {!costSheetClosed && canEditCosts && (
            <div className="space-y-1.5 pt-1 no-print">
              <TypeaheadInput
                placeholder="Ítem (ej. Transporte, Catering...)"
                value={newCostLabel}
                onChange={setNewCostLabel}
                fetchSuggestions={fetchCostTypeSuggestions}
                className="h-7 text-xs w-full"
              />
              <div className="flex items-center gap-2">
                <Select value={newCostCategory ?? undefined} onValueChange={(v) => setNewCostCategory(v ?? null)}>
                  <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                    <SelectValue placeholder="Categoría">{newCostCategory ?? "Categoría"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {COST_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="w-20 sm:w-28 shrink-0">
                  <MoneyInput
                    placeholder={newCostEsBhe ? "Líquido" : "$0"}
                    value={newCostAmount}
                    onChange={setNewCostAmount}
                    className="h-7 text-xs"
                  />
                </div>
              </div>

              {newCostCategory === "Bencina" && (
                <BencinaCalculator
                  km={newCostKm}
                  kmRate={newCostKmRate}
                  onChange={({ km, kmRate, amountCents }) => {
                    setNewCostKm(km);
                    setNewCostKmRate(kmRate);
                    if (amountCents != null) setNewCostAmount(String(Math.round(amountCents / 100)));
                  }}
                />
              )}

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
                        category: newCostCategory,
                        amount: newCostEsBhe ? liquidoToBruto(cents) : cents,
                        liquidoAmount: newCostEsBhe ? cents : null,
                        esBhe: newCostEsBhe,
                        responsable: newCostResponsable || null,
                        responsableContactId: newCostResponsableContactId,
                        comprobanteUrl: newCostComprobante || null,
                        pagado: false,
                        comprobantePagoUrl: null,
                        notes: null,
                        km: newCostKm,
                        kmRate: newCostKmRate,
                      },
                    ]);
                    setNewCostLabel("");
                    setNewCostCategory(null);
                    setNewCostAmount("");
                    setNewCostResponsable("");
                    setNewCostResponsableContactId(null);
                    setNewCostComprobante("");
                    setNewCostEsBhe(false);
                    setNewCostKm(null);
                    setNewCostKmRate(null);
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
              {!costSheetClosed && canEditCosts && (
                <Button size="sm" variant="ghost" className="h-7 text-xs cursor-pointer no-print" onClick={applyCostsToExpenses}>
                  Usar como Egresos del evento
                </Button>
              )}
            </div>
          )}

          <div className="no-print space-y-2 pt-1">
            <Label className="text-xs text-muted-foreground">
              Reparto de utilidad ({formatCents(utilidadCents)})
            </Label>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  inputMode="numeric"
                  disabled={costSheetClosed || !canEditCosts}
                  value={resolvedProjectPct}
                  onChange={(e) => {
                    setProfitSplitProjectPct(e.target.value === "" ? null : Number(e.target.value));
                    setCostsDirty(true);
                  }}
                  className="h-8 w-16 text-sm"
                />
                <span className="text-sm text-muted-foreground">% {event.projectName || "Proyecto"} = </span>
                <span className="text-sm font-semibold">{formatCents(projectSplitCents)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  inputMode="numeric"
                  disabled={costSheetClosed || !canEditCosts}
                  value={resolvedTrinoPct}
                  onChange={(e) => {
                    setProfitSplitTrinoPct(e.target.value === "" ? null : Number(e.target.value));
                    setCostsDirty(true);
                  }}
                  className="h-8 w-16 text-sm"
                />
                <span className="text-sm text-muted-foreground">% Trino = </span>
                <span className="text-sm font-semibold">{formatCents(trinoSplitCents)}</span>
              </div>
            </div>

            <Textarea
              id="profit-split-note"
              rows={2}
              disabled={costSheetClosed || !canEditCosts}
              placeholder="Nota opcional -- ej. toda la utilidad se va a cubrir un costo puntual"
              value={profitSplitNote}
              onChange={(e) => { setProfitSplitNote(e.target.value); setCostsDirty(true); }}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Estos porcentajes y montos los ven los firmantes al aprobar el cierre, para saber cuánto transferir.
            </p>
          </div>

          {/* Comprobante de la transferencia del reparto -- el paso final
              del evento, después de que todos firmaron. */}
          <div className="no-print space-y-1.5 pt-1 border-t pt-3">
            <Label className="text-xs text-muted-foreground">Comprobante de transferencia del reparto</Label>
            <input
              ref={transferProofInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              disabled={uploadingTransferProof}
              onChange={handleTransferProofChange}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs cursor-pointer"
                disabled={uploadingTransferProof}
                onClick={() => transferProofInputRef.current?.click()}
              >
                {uploadingTransferProof ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                {profitSplitTransferProofUrl ? "Cambiar comprobante" : "Subir comprobante de transferencia"}
              </Button>
              {profitSplitTransferProofUrl && (
                <SignedFileLink path={profitSplitTransferProofUrl} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                  <Receipt className="h-3.5 w-3.5" /> Ver comprobante
                </SignedFileLink>
              )}
            </div>
            {profitSplitTransferredAt && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Transferido el {format(new Date(profitSplitTransferredAt), "d MMM yyyy, HH:mm", { locale: es })} -- evento cerrado.
              </p>
            )}
          </div>

          <p className="hidden print:block text-sm pt-2">
            <span className="font-medium">Reparto de utilidad ({formatCents(utilidadCents)}):</span>{" "}
            {resolvedProjectPct}% {event.projectName || "Proyecto"} = {formatCents(projectSplitCents)} ·{" "}
            {resolvedTrinoPct}% Trino = {formatCents(trinoSplitCents)}
            {profitSplitNote.trim() && (
              <>
                <br /><span className="font-medium">Nota:</span> {profitSplitNote.trim()}
              </>
            )}
          </p>

          <div className="hidden print:grid grid-cols-2 gap-8 pt-12">
            <div className="text-center text-sm">
              <div className="border-t border-foreground pt-1">Firma Trino</div>
            </div>
            <div className="text-center text-sm">
              <div className="border-t border-foreground pt-1">
                Firma Rep. {event.projectName || "Proyecto"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Aprobación del cierre de caja -- fuera de la Card de Costos a
          propósito: quien firma (Admin/Artista) tiene que poder ver quién
          falta aunque su rol no lo deje ver los montos de la Planilla. Sin
          plata acá, solo nombres/checks -- igual que /eventos/[id]/firmar. */}
      {signatureData && (
        <Card data-section="approval" className="no-print">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Aprobación
              <Badge
                variant="secondary"
                className={`text-xs ${signatureData.allSigned ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
              >
                {signatureData.allSigned
                  ? "Aprobado por todos"
                  : `${signatureData.requiredSigners.filter((r) => signatureData.signatures.some((s) => s.userId === r.userId)).length}/${signatureData.requiredSigners.length} firmaron`}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {signatureData.requiredSigners.map((r) => {
              const signature = signatureData.signatures.find((s) => s.userId === r.userId);
              return (
                <div key={r.userId} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    {signature ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span>{r.fullName || r.email || "Usuario"}</span>
                  </div>
                  {signature && (
                    <span className="text-muted-foreground">
                      {format(new Date(signature.signedAt), "d MMM yyyy, HH:mm", { locale: es })}
                    </span>
                  )}
                </div>
              );
            })}
            {/* Firmantes "voluntarios" -- alguien (típicamente un admin de la
                organización) que firmó sin ser de los requeridos para ESTE
                proyecto. Igual quedó su aprobación registrada, así que se
                muestra igual, solo que no cuenta para el "X/Y firmaron". */}
            {signatureData.signatures
              .filter((s) => !signatureData.requiredSigners.some((r) => r.userId === s.userId))
              .map((s) => (
                <div key={s.userId} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    <span>{s.fullName || s.email || "Usuario"}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {format(new Date(s.signedAt), "d MMM yyyy, HH:mm", { locale: es })}
                  </span>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

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

      <EventPrintFooter />

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
