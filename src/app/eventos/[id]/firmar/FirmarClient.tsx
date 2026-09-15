"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Loader2, ArrowLeft, ShieldAlert, Lock, Receipt } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { ClosingDocumentView } from "@/types/external-signature";
import { DocumentoCierre } from "@/components/events/DocumentoCierre";
import { ApprovalSummary } from "@/components/events/ApprovalSummary";
import { FirmaPasos, type DatosFirmante } from "@/components/events/FirmaPasos";
import { SignedFileLink } from "@/components/finances/SignedFileLink";
import { getFinanceSignedUrl } from "@/lib/finance-files";
import { useAuth } from "@/lib/auth-context";

interface Signer {
  userId: string;
  fullName: string | null;
  email: string | null;
}

interface Signature extends Signer {
  signedAt: string;
  ipAddress: string | null;
  signerName: string | null;
  signerRut: string | null;
  signerEmail: string | null;
  signerPhone: string | null;
  otpVerifiedAt: string | null;
  documentHash: string | null;
}

interface SignaturesData {
  eventName: string;
  costSheetClosed: boolean;
  requiredSigners: Signer[];
  signatures: Signature[];
  allSigned: boolean;
  alreadySigned: boolean;
  canSign: boolean;
  document: ClosingDocumentView | null;
  profitSplitTransferProofUrl: string | null;
  externalSigners: { id: string; name: string; roleLabel: string | null; signedAt: string | null }[];
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

/**
 * Pantalla de firma del EQUIPO. Desde el 15 sep 2026 es la misma que la del
 * cliente externo (/firmar/[token]): mismo documento, mismo recuadro de
 * Aprobación, mismo código de 6 dígitos al correo y mismo texto de la Ley
 * 19.799 -- ver src/components/events/FirmaPasos.tsx. Antes firmar acá era
 * un click, lo que probaba que había una sesión abierta, no que la persona
 * quiso firmar ese documento.
 *
 * El control de acceso real (solo firmantes de este evento) lo hace la API.
 */
export default function FirmarClient() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<SignaturesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [guardarPerfil, setGuardarPerfil] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    try {
      const res = await fetch(`/api/eventos/${id}/signatures`);
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error("No se pudo cargar la información del cierre");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function requestCode(datos: DatosFirmante) {
    try {
      const res = await fetch(`/api/eventos/${id}/signatures/codigo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...datos, saveToProfile: guardarPerfil }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "No se pudo enviar el código");
        return;
      }
      toast.success(`Código enviado a ${body.sentToMasked}`);
      await load();
    } catch {
      toast.error("No se pudo enviar el código");
    }
  }

  async function sign(code: string) {
    try {
      const res = await fetch(`/api/eventos/${id}/signatures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "No se pudo firmar");
        return;
      }
      toast.success("Quedaste registrado como aprobado");
      await load();
    } catch {
      toast.error("No se pudo firmar");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (forbidden || !data) {
    return (
      <Shell>
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="font-medium">No tienes acceso a este cierre</p>
            <p className="text-sm text-muted-foreground">Solo lo pueden ver los integrantes de este proyecto.</p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const propia = user ? data.signatures.find((s) => s.userId === user.id) ?? null : null;

  const approvalTeam = data.requiredSigners.map((r) => {
    const sig = data.signatures.find((s) => s.userId === r.userId);
    return { name: r.fullName || r.email || "Integrante", detail: r.email, signedAt: sig?.signedAt ?? null };
  });
  const approvalExternal = data.externalSigners.map((e) => ({
    name: e.name,
    detail: e.roleLabel,
    signedAt: e.signedAt,
  }));

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Firma de conformidad</p>
          <h1 className="text-xl font-semibold leading-tight">{data.eventName}</h1>
        </div>
        <Link
          href={`/eventos/${id}`}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Al evento
        </Link>
      </div>

      {!data.costSheetClosed && (
        <Card>
          <CardContent className="py-6 text-center space-y-1">
            <Lock className="h-6 w-6 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">La caja todavía no está cerrada</p>
            <p className="text-xs text-muted-foreground">Cuando se cierre vas a poder revisar y firmar el cierre.</p>
          </CardContent>
        </Card>
      )}

      {data.document && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">1. Revisa el cierre de caja</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DocumentoCierre doc={data.document} resolveComprobante={getFinanceSignedUrl} />
            {data.profitSplitTransferProofUrl && (
              <SignedFileLink
                path={data.profitSplitTransferProofUrl}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                <Receipt className="h-3.5 w-3.5" /> Ver comprobante de la transferencia
              </SignedFileLink>
            )}
          </CardContent>
        </Card>
      )}

      <ApprovalSummary team={approvalTeam} external={approvalExternal} />

      {data.alreadySigned ? (
        <>
          <Card>
            <CardContent className="py-8 text-center space-y-1">
              <CheckCircle2 className="h-10 w-10 mx-auto text-green-600" />
              <p className="text-lg font-semibold">Ya firmaste este cierre</p>
              {propia?.signedAt && <p className="text-sm text-muted-foreground">{fmt(propia.signedAt)}</p>}
            </CardContent>
          </Card>

          {/* Las firmas anteriores a la migración 102 no tienen evidencia
              que mostrar -- en esa época firmar era solo un click. */}
          {propia?.signerRut && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Constancia de tu firma</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                <Dato label="Nombre" value={propia.signerName ?? "—"} />
                <Dato label="RUT / identificación" value={propia.signerRut} />
                <Dato label="Correo" value={propia.signerEmail ?? "—"} />
                <Dato label="Teléfono" value={propia.signerPhone ?? "—"} />
                <Dato label="Fecha y hora" value={fmt(propia.signedAt)} />
                {propia.ipAddress && <Dato label="IP" value={propia.ipAddress} />}
                {propia.documentHash && (
                  <Dato label="Huella del documento" value={propia.documentHash.slice(0, 32) + "…"} />
                )}
              </CardContent>
            </Card>
          )}
        </>
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
        />
      ) : (
        data.costSheetClosed && (
          <Card>
            <CardContent className="py-6 text-center space-y-1">
              <p className="text-sm font-medium">No estás en la lista de firmantes</p>
              <p className="text-xs text-muted-foreground">
                Puedes revisar el cierre y ver quién falta, pero la aprobación la firman las personas de arriba.
              </p>
            </CardContent>
          </Card>
        )
      )}
    </Shell>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right break-all">{value}</span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-lg space-y-4 py-4 px-1">{children}</div>;
}
