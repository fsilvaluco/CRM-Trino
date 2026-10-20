"use client";

// Pantalla de una liquidación: el documento, quiénes firman y la firma del
// equipo. Desde la migración 109 firmar acá es firma electrónica simple
// (datos + código de 6 dígitos al correo de la cuenta), igual que el cierre
// de caja de un evento -- antes era un click. Desde acá también se emite el
// link para la contraparte que no tiene cuenta (ExternalSignersCard).
//
// Protegida por la API normal (requireAuth + acceso al proyecto).

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Loader2, ArrowLeft, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { SettlementDocumentView } from "@/types/external-signature";
import { DocumentoLiquidacion } from "@/components/finances/DocumentoLiquidacion";
import { ApprovalSummary } from "@/components/events/ApprovalSummary";
import { FirmaPasos, type DatosFirmante } from "@/components/events/FirmaPasos";
import { ExternalSignersCard } from "@/components/events/ExternalSignersCard";
import { getFinanceSignedUrl } from "@/lib/finance-files";
import { useAuth } from "@/lib/auth-context";

interface Signature {
  userId: string;
  signedAt: string;
  ipAddress: string | null;
  name: string | null;
  signerName: string | null;
  signerRut: string | null;
  signerEmail: string | null;
  signerPhone: string | null;
  otpVerifiedAt: string | null;
  documentHash: string | null;
  documentUnchanged: boolean | null;
}

interface Person {
  name: string;
  detail: string | null;
  signedAt: string | null;
}

interface SettlementDetail {
  id: string;
  payerName: string;
  payeeName: string;
  document: SettlementDocumentView | null;
  documentHash: string | null;
  approval: { team: Person[]; external: Person[] };
  signatures: Signature[];
  allSigned: boolean;
  alreadySigned: boolean;
  canSign: boolean;
  canManageSigners: boolean;
  me: { fullName: string | null; rut: string | null; email: string | null; phone: string | null; accountEmailMasked: string | null };
  otp: { sentToMasked: string | null; sentAt: string; expiresAt: string; attemptsLeft: number } | null;
}

function fmt(iso: string) {
  try {
    return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right break-all">{value}</span>
    </div>
  );
}

export default function FirmarLiquidacionPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<SettlementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardarPerfil, setGuardarPerfil] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/settlements/${id}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "No se pudo cargar la liquidación");
        return;
      }
      setData(body);
      setError(null);
    } catch {
      setError("No se pudo cargar la liquidación");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function requestCode(datos: DatosFirmante) {
    const res = await fetch(`/api/settlements/${id}/sign/codigo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...datos, saveToProfile: guardarPerfil }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "No se pudo enviar el código");
      return;
    }
    toast.success(`Código enviado a ${body.sentToMasked}`);
    await load();
  }

  async function sign(code: string) {
    const res = await fetch(`/api/settlements/${id}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, documentHash: data?.documentHash ?? null }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "No se pudo firmar");
      return;
    }
    toast.success("Firma registrada");
    await load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto w-full max-w-lg py-10 text-center space-y-2">
        <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="font-medium">{error ?? "Liquidación no encontrada"}</p>
        <Link href="/finances/comprobantes" className="text-sm text-muted-foreground hover:text-foreground">
          Volver a Comprobantes
        </Link>
      </div>
    );
  }

  const propia = user ? data.signatures.find((s) => s.userId === user.id) ?? null : null;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 py-4 px-1">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Firma de liquidación</p>
          <h1 className="text-xl font-semibold leading-tight">
            {data.payerName} → {data.payeeName}
          </h1>
        </div>
        <Link
          href="/finances/comprobantes"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Comprobantes
        </Link>
      </div>

      {data.document && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">1. Revisa la liquidación</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentoLiquidacion doc={data.document} resolveComprobante={getFinanceSignedUrl} />
          </CardContent>
        </Card>
      )}

      <ApprovalSummary team={data.approval.team} external={data.approval.external} />

      {data.alreadySigned ? (
        <Card>
          <CardContent className="py-6 text-center space-y-1">
            <CheckCircle2 className="h-8 w-8 mx-auto text-green-600" />
            <p className="font-semibold">Ya firmaste esta liquidación</p>
            {propia?.signerRut && (
              <div className="pt-3 space-y-1 text-xs text-left">
                <Dato label="Nombre" value={propia.signerName ?? "—"} />
                <Dato label="RUT / identificación" value={propia.signerRut ?? "—"} />
                <Dato label="Fecha y hora" value={fmt(propia.signedAt)} />
                {propia.documentHash && <Dato label="Huella" value={propia.documentHash.slice(0, 32) + "…"} />}
              </div>
            )}
          </CardContent>
        </Card>
      ) : data.canSign ? (
        <FirmaPasos
          initial={{
            name: data.me.fullName ?? "",
            rut: data.me.rut ?? "",
            email: data.me.email ?? "",
            phone: data.me.phone ?? "",
          }}
          emailLocked
          emailHint={`El código llega al correo de tu cuenta (${data.me.accountEmailMasked ?? "tu correo"}).`}
          guardarPerfil={{ checked: guardarPerfil, onChange: setGuardarPerfil }}
          otp={data.otp}
          onRequestCode={requestCode}
          onSign={sign}
          documentNoun="la liquidación"
        />
      ) : (
        <Card>
          <CardContent className="py-6 text-center space-y-1">
            <p className="text-sm font-medium">No estás en la lista de firmantes</p>
            <p className="text-xs text-muted-foreground">Puedes revisarla y ver quién falta.</p>
          </CardContent>
        </Card>
      )}

      {data.canManageSigners && (
        <ExternalSignersCard
          apiBase={`/api/settlements/${id}/external-signers`}
          ready
          copy={{
            title: "Firma de la contraparte (sin cuenta)",
            defaultRole: "Beneficiario de la liquidación",
            empty:
              "Para que la otra parte del pago firme su conformidad sin tener cuenta en la app: le llega un link, se identifica con su RUT y confirma con un código a su correo.",
            invalidatedFallback: "Se corrigió la liquidación después de esta firma",
            namePlaceholder: "Nombre de la contraparte",
            emailPlaceholder: "correo@ejemplo.com",
          }}
        />
      )}
    </div>
  );
}
