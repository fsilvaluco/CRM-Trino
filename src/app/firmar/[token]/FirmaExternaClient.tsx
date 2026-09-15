"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Mail } from "lucide-react";
import type { ExternalSignatureView } from "@/types/external-signature";
import { DocumentoCierre } from "./DocumentoCierre";
import { Shell, EstadoError, EstadoCerrado, EstadoFirmado, formatDateTime } from "./EstadosFirma";

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

  const [name, setName] = useState("");
  const [rut, setRut] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [signing, setSigning] = useState(false);

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
      if (body.invitation?.invitedName && !name) setName(body.invitation.invitedName);
    } catch {
      setLoadError("No se pudo abrir este link. Revisa tu conexión.");
    } finally {
      setLoading(false);
    }
    // `name` a propósito fuera de las dependencias: solo se usa para
    // prellenar la primera vez, no para re-cargar cuando el usuario escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function requestCode() {
    setSending(true);
    try {
      const res = await fetch(`/api/public/firma/${token}/codigo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rut, email, phone }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "No se pudo enviar el código");
        return;
      }
      toast.success(`Código enviado a ${body.sentToMasked}`);
      setCode("");
      await load();
    } catch {
      toast.error("No se pudo enviar el código");
    } finally {
      setSending(false);
    }
  }

  async function sign() {
    setSigning(true);
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
    } finally {
      setSigning(false);
    }
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

  const codeSent = Boolean(data.otp);
  const identityComplete =
    name.trim().length >= 3 && rut.trim().length >= 6 && email.includes("@") && phone.replace(/\D/g, "").length >= 8;

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
          <DocumentoCierre doc={data.document} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">2. Identifícate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field id="name" label="Nombre completo" value={name} onChange={setName} placeholder="Ennio Pérez González" />
          <Field id="rut" label="RUT o identificación" value={rut} onChange={setRut} placeholder="12.345.678-5" />
          <Field
            id="email"
            label="Correo"
            value={email}
            onChange={setEmail}
            type="email"
            placeholder="ennio@correo.cl"
            hint={
              data.invitation.emailLocked
                ? `Este link está dirigido a ${data.invitation.invitedEmailMasked} — el código solo se manda a ese correo.`
                : "Acá te llega el código para firmar."
            }
          />
          <Field id="phone" label="Teléfono" value={phone} onChange={setPhone} type="tel" placeholder="+56 9 1234 5678" />

          <Button
            className="w-full cursor-pointer"
            variant={codeSent ? "outline" : "default"}
            disabled={!identityComplete || sending}
            onClick={requestCode}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Mail className="h-4 w-4 mr-1.5" />}
            {codeSent ? "Reenviar código" : "Enviarme el código"}
          </Button>
        </CardContent>
      </Card>

      <Card className={codeSent ? "" : "opacity-60"}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">3. Confirma y firma</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {codeSent ? (
            <p className="text-xs text-muted-foreground">
              Te mandamos un código de 6 dígitos a {data.otp?.sentToMasked}. Vence a las{" "}
              {data.otp ? formatDateTime(data.otp.expiresAt) : ""}.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Primero pide el código en el paso anterior.</p>
          )}

          <Input
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            className="text-center text-2xl tracking-[0.5em] font-semibold h-14"
            value={code}
            disabled={!codeSent}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />

          <p className="text-xs text-muted-foreground leading-relaxed">
            Al firmar declaro que revisé el cierre de caja de arriba y doy mi conformidad con las cifras que contiene.
            Queda registrada la fecha y hora, mi dirección IP, mi dispositivo y una huella digital (SHA-256) del
            documento exacto que estoy firmando. Es una firma electrónica simple (Ley 19.799) y es irreversible.
          </p>

          <Button className="w-full cursor-pointer" disabled={!codeSent || code.length !== 6 || signing} onClick={sign}>
            {signing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ShieldCheck className="h-4 w-4 mr-1.5" />}
            Firmar conformidad
          </Button>
        </CardContent>
      </Card>
    </Shell>
  );
}

function Field(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id} className="text-xs">
        {props.label}
      </Label>
      <Input
        id={props.id}
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && <p className="text-[11px] text-muted-foreground">{props.hint}</p>}
    </div>
  );
}
