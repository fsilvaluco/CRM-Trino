"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ExternalSignatureView } from "@/types/external-signature";
import { DocumentoCierre } from "@/components/events/DocumentoCierre";
import { ApprovalSummary } from "@/components/events/ApprovalSummary";
import { FirmaPasos, type DatosFirmante } from "@/components/events/FirmaPasos";
import { Shell, EstadoError, EstadoCerrado, EstadoFirmado } from "./EstadosFirma";

/** Pantalla de firma para alguien de AFUERA: el cliente de un evento que
 * Trino produjo (booking, ticketera, producción) pero que no es un proyecto
 * de la cartera, así que no tiene ni va a tener cuenta en la app. El
 * control de acceso es el token del link -- no hay sesión, no hay
 * project_members, no hay matriz de permisos. Ver
 * src/lib/external-signature.ts y la migración 099. */
export default function FirmaExternaClient() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ExternalSignatureView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/firma/${token}`);
      const body = await res.json();
      if (!res.ok) {
        setLoadError(body.error ?? "No se pudo abrir este link");
        return;
      }
      setData(body);
      setLoadError(null);
    } catch {
      setLoadError("No se pudo abrir este link. Revisa tu conexión.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function requestCode(datos: DatosFirmante) {
    try {
      const res = await fetch(`/api/public/firma/${token}/codigo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
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
      const res = await fetch(`/api/public/firma/${token}/firmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "No se pudo firmar");
        return;
      }
      toast.success("Firma registrada");
      await load();
    } catch {
      toast.error("No se pudo firmar");
    }
  }

  // El bucket de comprobantes es privado y el firmante externo no tiene
  // sesión -- la URL la firma el backend contra el token del link, y solo
  // para archivos que sean de ESTE cierre.
  async function resolveComprobante(path: string): Promise<string | null> {
    const res = await fetch(`/api/public/firma/${token}/comprobante-costo?path=${encodeURIComponent(path)}`);
    if (!res.ok) return null;
    const body = await res.json();
    return body.url ?? null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError || !data) {
    return <EstadoError title={loadError ?? "Link no válido"} />;
  }

  if (data.status === "firmado" && data.signature) {
    return <EstadoFirmado data={{ ...data, signature: data.signature }} token={token} />;
  }

  if (data.status !== "pendiente") {
    return <EstadoCerrado vencido={data.status === "vencido"} />;
  }

  if (!data.document) {
    return <EstadoError title="No se pudo cargar el documento" hint="Avísale al equipo que te mandó el link." />;
  }

  return (
    <Shell>
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Firma de conformidad</p>
        <h1 className="text-xl font-semibold leading-tight">{data.document.eventName}</h1>
        {data.invitation.roleLabel && (
          <p className="text-sm text-muted-foreground">Firmas como: {data.invitation.roleLabel}</p>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">1. Revisa el cierre de caja</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentoCierre doc={data.document} resolveComprobante={resolveComprobante} />
        </CardContent>
      </Card>

      {data.approval && (
        <ApprovalSummary
          team={data.approval.requiredSigners.map((r) => ({
            name: r.name,
            detail: r.email,
            signedAt: r.signedAt,
          }))}
          external={data.approval.externalSigners.map((e) => ({
            name: e.name,
            detail: e.roleLabel,
            signedAt: e.signedAt,
            isMe: e.isMe,
          }))}
        />
      )}

      <FirmaPasos
        initial={{ name: data.invitation.invitedName ?? "" }}
        emailHint={
          data.invitation.emailLocked
            ? `Este link está dirigido a ${data.invitation.invitedEmailMasked} — el código solo se manda a ese correo.`
            : "Acá te llega el código para firmar."
        }
        otp={data.otp}
        onRequestCode={requestCode}
        onSign={sign}
      />
    </Shell>
  );
}
