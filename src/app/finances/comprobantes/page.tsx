"use client";

// Comprobantes: todo lo que ya se subió como respaldo de plata, en un solo
// lugar -- las liquidaciones de regalías/merch (nuevas, ver
// scripts/migrations/087_settlements.sql) y los comprobantes que ya
// existían por evento (cierre de caja + transferencia del reparto, ver
// shows.cost_sheet_closing_file_path / profit_split_transfer_proof_url).
// No duplica datos de Eventos: /api/settlements/event-receipts solo lee
// `shows`, esto es una vista, no una copia.

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, FolderOpen, Music2, Check, PenLine, Loader2, ExternalLink, Link2 } from "lucide-react";
import { useProject } from "@/lib/project-context";
import { useAuth } from "@/lib/auth-context";
import { SettlementFormDialog } from "@/components/finances/SettlementFormDialog";
import { SignedFileLink } from "@/components/finances/SignedFileLink";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Signer {
  userId: string;
  name: string | null;
}

interface Signature extends Signer {
  signedAt: string;
}

interface Settlement {
  id: string;
  projectId: string;
  type: "regalias" | "merch" | "otro";
  periodMonth: number | null;
  periodYear: number | null;
  payerName: string;
  payeeName: string;
  sourceAmount: number;
  sourceProofPath: string | null;
  sourceProofName: string | null;
  percentage: number;
  payoutAmount: number;
  payoutProofPath: string | null;
  payoutProofName: string | null;
  paid: boolean;
  notes: string | null;
  createdAt: string;
  requiredSigners: Signer[];
  signatures: Signature[];
}

interface EventReceipt {
  showId: string;
  name: string | null;
  date: string;
  projectId: string;
  closingFilePath: string | null;
  closingFileName: string | null;
  closingFiledAt: string | null;
  transferProofPath: string | null;
  transferredAt: string | null;
  projectPct: number | null;
  trinoPct: number | null;
}

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function formatCLP(amount: number) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);
}

function typeLabel(type: Settlement["type"]) {
  if (type === "regalias") return "Regalías";
  if (type === "merch") return "Merchandising";
  return "Otro";
}

function SettlementCard({ settlement, userId, onSign }: { settlement: Settlement; userId: string | undefined; onSign: (id: string) => void }) {
  const alreadySigned = settlement.signatures.some((s) => s.userId === userId);
  // Si se eligieron firmantes a mano, solo ellos pueden firmar -- mismo
  // criterio que /api/settlements/[id]/sign.
  const canSign = settlement.requiredSigners.length > 0
    ? settlement.requiredSigners.some((s) => s.userId === userId) && !alreadySigned
    : !alreadySigned;
  const period = settlement.periodMonth && settlement.periodYear
    ? `${MONTHS[settlement.periodMonth - 1]} ${settlement.periodYear}`
    : null;

  const copySignLink = async () => {
    const url = `${window.location.origin}/finances/comprobantes/${settlement.id}/firmar`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("No se pudo copiar el link");
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{typeLabel(settlement.type)}</Badge>
            {period && <span className="text-xs text-muted-foreground">{period}</span>}
          </div>
          <p className="text-sm font-medium mt-1">{settlement.payerName} → {settlement.payeeName}</p>
        </div>
        {settlement.paid && (
          <Badge className="bg-green-600 text-white text-[10px]"><Check className="h-2.5 w-2.5 mr-1" />Pagado</Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Origen</p>
          <p className="font-semibold">{formatCLP(settlement.sourceAmount)}</p>
          {settlement.sourceProofPath && (
            <SignedFileLink path={settlement.sourceProofPath} className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
              <ExternalLink className="h-3 w-3" /> Comprobante
            </SignedFileLink>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">A pagar ({settlement.percentage}%)</p>
          <p className="font-semibold">{formatCLP(settlement.payoutAmount)}</p>
          {settlement.payoutProofPath && (
            <SignedFileLink path={settlement.payoutProofPath} className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
              <ExternalLink className="h-3 w-3" /> Comprobante
            </SignedFileLink>
          )}
        </div>
      </div>

      {settlement.notes && <p className="text-xs text-muted-foreground">{settlement.notes}</p>}

      <div className="flex items-center justify-between border-t pt-2 gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {settlement.requiredSigners.length > 0 ? (
            settlement.requiredSigners.map((s) => {
              const signed = settlement.signatures.some((sig) => sig.userId === s.userId);
              return (
                <Badge
                  key={s.userId}
                  variant="outline"
                  className={`text-[10px] gap-1 ${signed ? "border-green-600/40 text-green-700 dark:text-green-400" : "text-muted-foreground border-dashed"}`}
                >
                  {signed ? <Check className="h-2.5 w-2.5" /> : <PenLine className="h-2.5 w-2.5" />} {s.name ?? "Alguien"}
                </Badge>
              );
            })
          ) : settlement.signatures.length === 0 ? (
            <span className="text-xs text-muted-foreground">Sin firmas todavía</span>
          ) : (
            settlement.signatures.map((s) => (
              <Badge key={s.userId} variant="outline" className="text-[10px] gap-1">
                <PenLine className="h-2.5 w-2.5" /> {s.name ?? "Alguien"}
              </Badge>
            ))
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="ghost" className="cursor-pointer h-7 text-xs" onClick={copySignLink} title="Copiar link para compartir">
            <Link2 className="h-3 w-3 mr-1" /> Link
          </Button>
          {canSign && (
            <Button size="sm" variant="outline" className="cursor-pointer h-7 text-xs" onClick={() => onSign(settlement.id)}>
              <PenLine className="h-3 w-3 mr-1" /> Firmar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function EventReceiptFolder({ receipt }: { receipt: EventReceipt }) {
  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center gap-2">
        <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
        <Link href={`/eventos/${receipt.showId}`} className="text-sm font-medium hover:text-blue-600 truncate">
          {receipt.name}
        </Link>
        <span className="text-xs text-muted-foreground shrink-0">
          {format(new Date(receipt.date), "d MMM yyyy", { locale: es })}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {receipt.closingFilePath && (
          <SignedFileLink path={receipt.closingFilePath} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border hover:bg-muted/50">
            <ExternalLink className="h-3 w-3" /> Cierre de caja
          </SignedFileLink>
        )}
        {receipt.transferProofPath && (
          <SignedFileLink path={receipt.transferProofPath} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border hover:bg-muted/50">
            <ExternalLink className="h-3 w-3" />
            Reparto {receipt.trinoPct != null ? `(Sello ${receipt.trinoPct}%)` : ""}
          </SignedFileLink>
        )}
        {!receipt.closingFilePath && !receipt.transferProofPath && (
          <span className="text-xs text-muted-foreground">Sin comprobantes</span>
        )}
      </div>
    </div>
  );
}

export default function ComprobantesPage() {
  const { user } = useAuth();
  const { activeProject, isAllProjects } = useProject();
  const activeProjectId = activeProject?.id ?? null;
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [eventReceipts, setEventReceipts] = useState<EventReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (!isAllProjects && activeProjectId) params.set("projectId", activeProjectId);

      const [settlementsRes, receiptsRes] = await Promise.all([
        fetch(`/api/settlements?${params}`),
        fetch(`/api/settlements/event-receipts?${params}`),
      ]);
      const [settlementsData, receiptsData] = await Promise.all([settlementsRes.json(), receiptsRes.json()]);
      setSettlements(Array.isArray(settlementsData) ? settlementsData : []);
      setEventReceipts(Array.isArray(receiptsData) ? receiptsData : []);
    } catch {
      // Preserva datos previos si la carga falla transitoriamente
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, isAllProjects]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const handleSign = async (id: string) => {
    const res = await fetch(`/api/settlements/${id}/sign`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error || "Error al firmar");
      return;
    }
    toast.success("Firmado");
    await load();
  };

  const regalias = settlements.filter((s) => s.type === "regalias");
  const merch = settlements.filter((s) => s.type === "merch");
  const otros = settlements.filter((s) => s.type === "otro");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comprobantes</h1>
          <p className="text-muted-foreground text-sm">
            {isAllProjects || !activeProject ? "Todos los proyectos" : `Proyecto: ${activeProject.name}`}
          </p>
        </div>
        <Button
          onClick={() => {
            if (isAllProjects) { toast.warning("Selecciona un proyecto para crear una liquidación"); return; }
            setShowForm(true);
          }}
          className="cursor-pointer"
          disabled={isAllProjects}
          title={isAllProjects ? "Selecciona un proyecto para crear una liquidación" : undefined}
        >
          <Plus className="h-4 w-4 mr-2" /> Nueva liquidación
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : (
        <Tabs defaultValue="liquidaciones">
          <TabsList>
            <TabsTrigger value="liquidaciones">Regalías y Merch ({settlements.length})</TabsTrigger>
            <TabsTrigger value="eventos">Eventos ({eventReceipts.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="liquidaciones" className="mt-4 space-y-6">
            {settlements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Loader2 className="hidden" />
                <p className="text-sm text-muted-foreground">Sin liquidaciones registradas todavía</p>
              </div>
            ) : (
              <>
                {regalias.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold text-muted-foreground">Regalías</h2>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {regalias.map((s) => <SettlementCard key={s.id} settlement={s} userId={user?.id} onSign={handleSign} />)}
                    </div>
                  </div>
                )}
                {merch.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold text-muted-foreground">Merchandising</h2>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {merch.map((s) => <SettlementCard key={s.id} settlement={s} userId={user?.id} onSign={handleSign} />)}
                    </div>
                  </div>
                )}
                {otros.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold text-muted-foreground">Otros</h2>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {otros.map((s) => <SettlementCard key={s.id} settlement={s} userId={user?.id} onSign={handleSign} />)}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="eventos" className="mt-4">
            {eventReceipts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Music2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">Ningún evento tiene comprobantes subidos todavía</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {eventReceipts.map((r) => <EventReceiptFolder key={r.showId} receipt={r} />)}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <SettlementFormDialog
        open={showForm}
        onClose={() => setShowForm(false)}
        onCreated={load}
        projectId={activeProjectId}
      />
    </div>
  );
}
