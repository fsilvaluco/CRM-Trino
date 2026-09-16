"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export interface DatosFirmante {
  name: string;
  rut: string;
  email: string;
  phone: string;
}

export interface OtpEnVuelo {
  sentToMasked: string | null;
  expiresAt: string;
}

function fmtHora(iso: string) {
  try {
    return format(new Date(iso), "HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

/**
 * Los pasos "identifícate" y "confirma y firma", compartidos por las DOS
 * pantallas de firma. Nació en la pantalla del cliente externo; el 15 sep
 * 2026 se extrajo acá para que la del equipo sea idéntica -- misma
 * evidencia, mismo código de 6 dígitos, mismo texto de la Ley 19.799. Una
 * firma interna no vale menos que una externa.
 *
 * Lo que cambia entre ambas va por props:
 *  - el correo del equipo es el de su cuenta y no se edita (ahí llega el
 *    código); el del cliente externo lo escribe él.
 *  - solo el equipo tiene el check de "guardar para próximos cierres".
 */
export function FirmaPasos({
  initial,
  emailLocked,
  emailHint,
  guardarPerfil,
  otp,
  onRequestCode,
  onSign,
}: {
  initial?: Partial<DatosFirmante>;
  emailLocked?: boolean;
  emailHint?: string;
  guardarPerfil?: { checked: boolean; onChange: (v: boolean) => void };
  otp: OtpEnVuelo | null;
  onRequestCode: (datos: DatosFirmante) => Promise<void>;
  onSign: (code: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [rut, setRut] = useState(initial?.rut ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [signing, setSigning] = useState(false);

  const codeSent = Boolean(otp);
  const completo =
    name.trim().length >= 3 && rut.trim().length >= 6 && email.includes("@") && phone.replace(/\D/g, "").length >= 8;

  async function pedirCodigo() {
    setSending(true);
    try {
      await onRequestCode({ name: name.trim(), rut: rut.trim(), email: email.trim(), phone: phone.trim() });
      setCode("");
    } finally {
      setSending(false);
    }
  }

  async function firmar() {
    setSigning(true);
    try {
      await onSign(code);
    } finally {
      setSigning(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">2. Identifícate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Campo id="firma-name" label="Nombre completo" value={name} onChange={setName} placeholder="Ennio Pérez González" />
          <Campo id="firma-rut" label="RUT o identificación" value={rut} onChange={setRut} placeholder="12.345.678-5" />
          <Campo
            id="firma-email"
            label="Correo"
            type="email"
            value={email}
            onChange={setEmail}
            disabled={emailLocked}
            placeholder="ennio@correo.cl"
            hint={emailHint ?? "Acá te llega el código para firmar."}
          />
          <Campo id="firma-phone" label="Teléfono" type="tel" value={phone} onChange={setPhone} placeholder="+56 9 1234 5678" />

          {guardarPerfil && (
            <label className="flex items-start gap-2 text-xs cursor-pointer pt-1">
              <Checkbox
                className="mt-0.5 cursor-pointer"
                checked={guardarPerfil.checked}
                onCheckedChange={(v) => guardarPerfil.onChange(v === true)}
              />
              <span>
                Guardar estos datos para próximos cierres
                <span className="block text-muted-foreground">
                  Te los dejamos prellenados la próxima vez. El código de 6 dígitos se pide igual, siempre.
                </span>
              </span>
            </label>
          )}

          <Button
            className="w-full cursor-pointer"
            variant={codeSent ? "outline" : "default"}
            disabled={!completo || sending}
            onClick={pedirCodigo}
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
              Te mandamos un código de 6 dígitos a {otp?.sentToMasked}. Vence a las {otp ? fmtHora(otp.expiresAt) : ""}.
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

          <Button className="w-full cursor-pointer" disabled={!codeSent || code.length !== 6 || signing} onClick={firmar}>
            {signing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ShieldCheck className="h-4 w-4 mr-1.5" />}
            Firmar conformidad
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

function Campo(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  disabled?: boolean;
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
        disabled={props.disabled}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.hint && <p className="text-[11px] text-muted-foreground">{props.hint}</p>}
    </div>
  );
}
