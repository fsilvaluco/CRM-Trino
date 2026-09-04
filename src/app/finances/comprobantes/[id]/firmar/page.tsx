"use client";

// Pantalla de firma de una liquidación puntual -- el link que llega por
// correo (ver buildSettlementPendingSignatureEmailHtml) o que el creador
// comparte a mano apunta acá. Protegida por la API normal (requireAuth +
// acceso al proyecto), no es un link público sin login.

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Circle, Loader2, ArrowLeft, ExternalLink } from "lucide-react";
import { SignedFileLink } from "@/components/finances/SignedFileLink";

function formatCLP(amount: number) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);
}

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function typeLabel(type: string) {
  if (type === "regalias") return "Regalías";
  if (type === "merch") return "Merchandising";
  return "Liquidación";
}

interface Signer {
  userId: string;
  name: string | null;
}

interface Signature extends Signer {
  signedAt: string;
}

interface SettlementDetail {
  id: string;
  type: string;
  periodMonth: number | null;
  periodYear: number | null;
  payerName: string;
  payeeName: string;
  sourceAmount: number;
  sourceProofPath: string | null;
  percentage: number;
  payoutAmount: number;
  payoutProofPath: string | null;
  notes: string | null;
  requiredSigners: Signer[];
  signatures: Signature[];
  allSigned: boolean;
  canSign: boolean;
}

export default function FirmarLiquidacionPage() {
  const params = useParams();
  const id = params?.id as string;
  const [data, setData] = useState<SettlementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/settlements/${id}`);
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "No se pudo cargar la liquidación"); return; }
      setData(body);
    } catch {
      setError("No se pudo cargar la liquidación");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const handleSign = async () => {
    setSigning(true);
    try {
      const res = await fetch(`/api/settlements/${id}/sign`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error ?? "Error al firmar"); return; }
      toast.success("Firmado");
      await load();
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <Link href="/finances/comprobantes" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a Comprobantes
      </Link>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error || !data ? (
        <p className="text-sm text-destructive py-8 text-center">{error ?? "Liquidación no encontrada"}</p>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">{typeLabel(data.type)}</Badge>
              {data.periodMonth && data.periodYear && (
                <span className="text-xs text-muted-foreground">{MONTHS[data.periodMonth - 1]} {data.periodYear}</span>
              )}
            </div>
            <CardTitle className="text-lg">{data.payerName} → {data.payeeName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Origen</p>
                <p className="font-semibold">{formatCLP(data.sourceAmount)}</p>
                {data.sourceProofPath && (
                  <SignedFileLink path={data.sourceProofPath} className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                    <ExternalLink className="h-3 w-3" /> Comprobante
                  </SignedFileLink>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">A pagar ({data.percentage}%)</p>
                <p className="font-semibold">{formatCLP(data.payoutAmount)}</p>
                {data.payoutProofPath && (
                  <SignedFileLink path={data.payoutProofPath} className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                    <ExternalLink className="h-3 w-3" /> Comprobante
                  </SignedFileLink>
                )}
              </div>
            </div>

            {data.notes && <p className="text-sm text-muted-foreground">{data.notes}</p>}

            <div className="border-t pt-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Firmantes</p>
              {data.requiredSigners.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin firmantes elegidos -- cualquiera con acceso puede aprobarla.</p>
              ) : (
                data.requiredSigners.map((s) => {
                  const signed = data.signatures.some((sig) => sig.userId === s.userId);
                  return (
                    <div key={s.userId} className="flex items-center gap-2 text-sm">
                      {signed ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground/40" />}
                      {s.name}
                    </div>
                  );
                })
              )}
            </div>

            {data.canSign ? (
              <Button onClick={handleSign} disabled={signing} className="w-full cursor-pointer">
                {signing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Firmar
              </Button>
            ) : data.allSigned ? (
              <p className="text-sm text-green-600 dark:text-green-400 text-center">Ya está firmada por todos.</p>
            ) : (
              <p className="text-xs text-muted-foreground text-center">Ya firmaste, o no estás en la lista de firmantes.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
