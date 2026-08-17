"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ShieldAlert, Paperclip, Receipt, CheckCircle2, Clock, XCircle, Lock } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/lib/supabase";
import { TypeaheadInput } from "@/components/events/TypeaheadInput";
import { MoneyInput } from "@/components/shared/MoneyInput";

const CLP = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function formatCents(cents: number): string {
  return CLP.format(cents / 100);
}

function formatDate(iso: string) {
  try {
    return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

interface Submission {
  id: string;
  label: string;
  responsable: string | null;
  amount: number;
  comprobanteUrl: string | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  submittedBy: string;
  submitterName: string | null;
}

function statusBadge(status: Submission["status"]) {
  if (status === "approved") {
    return (
      <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-300">
        <CheckCircle2 className="h-3 w-3" /> Aprobado
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge variant="outline" className="gap-1 text-destructive border-destructive/40">
        <XCircle className="h-3 w-3" /> Rechazado
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
      <Clock className="h-3 w-3" /> Pendiente
    </Badge>
  );
}

// Página pensada para compartir el link (botón "Link para gastos" en la
// Planilla de costos): cualquier integrante del proyecto, logueado, deja
// acá su gasto -- detalle, responsable, comprobante (la IA lee el monto
// del comprobante como sugerencia editable) -- y queda "pendiente" hasta
// que un admin lo aprueba desde la Planilla de costos del evento. El
// control de acceso real lo hace la API (GET /cost-submissions), igual
// patrón que /eventos/[id]/firmar.
export default function ReportarGastoPage() {
  const { id } = useParams<{ id: string }>();
  const [eventName, setEventName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [costSheetClosed, setCostSheetClosed] = useState(false);
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);

  const [label, setLabel] = useState("");
  const [responsable, setResponsable] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [comprobanteUrl, setComprobanteUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    try {
      const res = await fetch(`/api/eventos/${id}/cost-submissions`);
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMySubmissions(data.submissions ?? []);
      setCostSheetClosed(Boolean(data.costSheetClosed));
      const name = data.currentUser?.fullName || data.currentUser?.email || "";
      setCurrentUserName(name);
      setResponsable((prev) => prev || name);

      const eventRes = await fetch(`/api/eventos/${id}`);
      if (eventRes.ok) {
        const eventData = await eventRes.json();
        setEventName(eventData.name ?? "");
      }
    } catch {
      toast.error("No se pudo cargar la información del evento");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function fetchCostTypeSuggestions(query: string) {
    const res = await fetch(`/api/cost-item-types?search=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data: Array<{ id: string; name: string }> = await res.json();
    return data.map((t) => ({ label: t.name, value: t.id }));
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("El archivo no puede superar 25 MB");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const storagePath = `cost-submissions/${id}/${Date.now()}.${ext}`;
      const uploadResult = await supabase.storage.from("finances").upload(storagePath, file, { upsert: false });
      if (uploadResult.error) {
        toast.error("Error subiendo el archivo: " + uploadResult.error.message);
        return;
      }
      const { data } = supabase.storage.from("finances").getPublicUrl(storagePath);
      setComprobanteUrl(data.publicUrl);
      toast.success("Comprobante adjuntado");

      // Lectura con IA -- solo sugiere el monto, nunca bloquea el envío si falla.
      const isPdf = file.type === "application/pdf" || ext?.toLowerCase() === "pdf";
      setExtracting(true);
      try {
        const toBase64 = () =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        const base64 = await toBase64();
        const body = isPdf
          ? { mode: "pdf", pdfBase64: base64 }
          : { mode: "image", imageBase64: base64, mediaType: file.type || "image/jpeg" };
        const extractRes = await fetch("/api/eventos/cost-submissions-extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (extractRes.ok) {
          const receipt = await extractRes.json();
          if (typeof receipt.amount === "number" && receipt.amount > 0) {
            setAmount(String(receipt.amount));
            toast.success("Monto leído del comprobante -- revísalo antes de enviar");
          }
          if (receipt.description && !label.trim()) setLabel(receipt.description);
        }
      } catch {
        // La lectura con IA es best-effort -- si falla, la persona ingresa el monto a mano.
      } finally {
        setExtracting(false);
      }
    } catch {
      toast.error("No se pudo subir el archivo");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!label.trim()) {
      toast.error("Escribe el detalle del gasto");
      return;
    }
    const pesos = parseInt(amount.replace(/\D/g, ""), 10);
    if (!Number.isFinite(pesos) || pesos <= 0) {
      toast.error("Ingresa un monto válido");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/eventos/${id}/cost-submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          responsable: responsable.trim() || null,
          amount: pesos * 100,
          comprobanteUrl,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "No se pudo enviar el gasto");
        return;
      }
      toast.success("Gasto enviado -- queda pendiente de aprobación");
      setLabel("");
      setAmount("");
      setNotes("");
      setComprobanteUrl(null);
      void load();
    } catch {
      toast.error("No se pudo enviar el gasto");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-3">
        <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">
          No tienes acceso a este evento -- solo los integrantes del proyecto pueden reportar gastos acá.
        </p>
        <Link href="/eventos" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a Eventos
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <Link href={`/eventos/${id}`} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-3.5 w-3.5" /> {eventName || "Volver al evento"}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Hola{currentUserName ? ` ${currentUserName}` : ""}, deja tu gasto acá
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {eventName ? `Evento: ${eventName}. ` : ""}
            Sube el comprobante y revisa el monto antes de enviar -- queda pendiente hasta que un admin lo aprueba.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {costSheetClosed ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Lock className="h-4 w-4" /> La caja de este evento ya está cerrada -- no se pueden reportar más gastos.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Ítem</label>
                <TypeaheadInput
                  placeholder="Ej. Transporte, Catering, Arriendo de sonido..."
                  value={label}
                  onChange={setLabel}
                  fetchSuggestions={fetchCostTypeSuggestions}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Responsable</label>
                <Input placeholder="A quién se le paga" value={responsable} onChange={(e) => setResponsable(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Comprobante</label>
                <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileChange} />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-2 cursor-pointer"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  {comprobanteUrl ? "Cambiar comprobante" : "Subir foto o PDF del comprobante"}
                </Button>
                {comprobanteUrl && (
                  <a href={comprobanteUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                    <Receipt className="h-3 w-3" /> Ver comprobante subido
                  </a>
                )}
                {extracting && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Leyendo el monto del comprobante...
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Monto</label>
                <MoneyInput placeholder="$0" value={amount} onChange={setAmount} />
                <p className="text-xs text-muted-foreground">
                  {extracting ? "" : "Si se leyó del comprobante, revísalo -- se puede editar."}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Notas (opcional)</label>
                <Textarea placeholder="Cualquier detalle adicional" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>

              <Button className="w-full cursor-pointer" disabled={submitting} onClick={handleSubmit}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Enviar gasto
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {mySubmissions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tus gastos reportados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {mySubmissions.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-2 border-b last:border-0 pb-2 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCents(s.amount)} · {formatDate(s.createdAt)}
                  </p>
                  {s.status === "rejected" && s.reviewNote && (
                    <p className="text-xs text-destructive mt-0.5">Motivo: {s.reviewNote}</p>
                  )}
                </div>
                {statusBadge(s.status)}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
