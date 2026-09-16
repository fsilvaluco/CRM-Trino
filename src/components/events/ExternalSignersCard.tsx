"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { UserCheck, Plus, Copy, Loader2, Ban, Download, CheckCircle2, Clock, Mail, AlertTriangle } from "lucide-react";
import type { ExternalSigner, ExternalSignerStatus } from "@/types/external-signature";

const STATUS_STYLE: Record<ExternalSignerStatus, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  firmado: "bg-green-100 text-green-700",
  invalidado: "bg-orange-100 text-orange-700",
  vencido: "bg-slate-100 text-slate-600",
  revocado: "bg-slate-100 text-slate-600",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

/**
 * Firma de un cliente que NO está en la app -- el productor del evento que
 * contrató booking/ticketera/producción pero que no es un proyecto de la
 * cartera, así que nunca va a tener usuario ni project_members. Se le emite
 * un link con token, entra sin cuenta, se identifica (nombre, RUT, correo,
 * teléfono), verifica su correo con un código y firma.
 *
 * Es independiente de la Aprobación interna: no cuenta para el "X/Y
 * firmaron" del cierre, es el respaldo frente al cliente.
 */
export function ExternalSignersCard({
  showId,
  costSheetClosed,
}: {
  showId: string;
  costSheetClosed: boolean;
}) {
  const [signers, setSigners] = useState<ExternalSigner[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [roleLabel, setRoleLabel] = useState("Cliente / Productor del evento");
  const [invitedName, setInvitedName] = useState("");
  const [invitedEmail, setInvitedEmail] = useState("");
  // Link recién emitido: el token en claro existe solo en esta respuesta,
  // así que se muestra hasta que la persona lo copie.
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [copying, setCopying] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/eventos/${showId}/external-signers`);
      if (!res.ok) return;
      const body = await res.json();
      setSigners(body.signers ?? []);
      setCanCreate(Boolean(body.canCreate));
    } finally {
      setLoading(false);
    }
  }, [showId]);

  useEffect(() => {
    load();
  }, [load]);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado -- mándaselo por WhatsApp o correo");
    } catch {
      toast.info(url);
    }
  }

  async function create() {
    setCreating(true);
    try {
      const res = await fetch(`/api/eventos/${showId}/external-signers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleLabel, invitedName, invitedEmail }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "No se pudo crear el link");
        return;
      }
      setFreshLink(body.url);
      setFormOpen(false);
      const correo = invitedEmail;
      setInvitedName("");
      setInvitedEmail("");
      await copy(body.url);
      if (body.emailSent) toast.success(`También le mandamos el link por correo a ${correo}`);
      await load();
    } catch {
      toast.error("No se pudo crear el link");
    } finally {
      setCreating(false);
    }
  }

  // Recupera el link ya emitido (se descifra en el backend, ver migración
  // 104) y lo copia -- sin tocar el token, así que el que ya tenga el
  // cliente sigue sirviendo.
  async function copyExisting(signer: ExternalSigner) {
    setCopying(signer.id);
    try {
      const res = await fetch(`/api/eventos/${showId}/external-signers/${signer.id}/link`);
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "No se pudo recuperar el link");
        return;
      }
      await copy(body.url);
    } catch {
      toast.error("No se pudo recuperar el link");
    } finally {
      setCopying(null);
    }
  }

  // "Reenviar" no es literal: el token en claro no existe en ninguna parte,
  // así que se emite uno nuevo con los mismos datos y el anterior se anula.
  async function resend(signer: ExternalSigner) {
    if (
      !confirm(
        `¿Reenviarle el link a ${signer.invitedEmail}? Se emite uno nuevo y el anterior deja de funcionar al instante.`
      )
    )
      return;
    setResending(signer.id);
    try {
      const res = await fetch(`/api/eventos/${showId}/external-signers/${signer.id}/reenviar`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "No se pudo reenviar");
        return;
      }
      toast.success(`Link nuevo enviado a ${body.sentTo}`);
      load();
    } catch {
      toast.error("No se pudo reenviar");
    } finally {
      setResending(null);
    }
  }

  async function revoke(signer: ExternalSigner) {
    if (!confirm(`¿Anular el link de ${signer.invitedName || signer.roleLabel || "este firmante"}? Deja de funcionar al instante.`)) return;
    const res = await fetch(`/api/eventos/${showId}/external-signers/${signer.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "No se pudo anular");
      return;
    }
    toast.success("Link anulado");
    load();
  }

  if (loading) return null;
  // Sin links emitidos y sin permiso para emitirlos: no hay nada que mostrar.
  if (signers.length === 0 && !canCreate) return null;

  return (
    <Card data-section="external-signature" className="no-print">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <UserCheck className="h-4 w-4" />
          Firma del cliente (sin cuenta)
        </CardTitle>
        {canCreate && costSheetClosed && !formOpen && (
          <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" onClick={() => setFormOpen(true)}>
            <Plus className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Crear link de firma</span>
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {!costSheetClosed && (
          <p className="text-xs text-muted-foreground">
            Cierra la caja para poder emitir el link -- lo que firma el cliente es el cierre definitivo.
          </p>
        )}

        {freshLink && (
          <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
            <p className="text-xs font-medium">Link listo -- este es el único momento en que se puede copiar</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-background px-2 py-1 text-[11px]">{freshLink}</code>
              <Button size="sm" variant="outline" className="h-7 cursor-pointer" onClick={() => copy(freshLink)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Guarda solo el hash del link, así que si se pierde hay que emitir uno nuevo.
            </p>
          </div>
        )}

        {formOpen && (
          <div className="rounded-lg border p-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ext-role" className="text-xs">En qué calidad firma</Label>
              <Input id="ext-role" value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ext-name" className="text-xs">Nombre (opcional)</Label>
              <Input id="ext-name" value={invitedName} onChange={(e) => setInvitedName(e.target.value)} placeholder="Ennio Pérez" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ext-email" className="text-xs">Correo al que fijar el link (opcional)</Label>
              <Input id="ext-email" type="email" value={invitedEmail} onChange={(e) => setInvitedEmail(e.target.value)} placeholder="ennio@correo.cl" />
              <p className="text-[11px] text-muted-foreground">
                Si lo cargas, le mandamos el link por correo apenas lo crees, y el código de verificación solo se
                puede mandar a esa casilla -- nadie más puede firmar aunque le reenvíen el link.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="cursor-pointer" disabled={creating} onClick={create}>
                {creating && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Crear link
              </Button>
              <Button size="sm" variant="ghost" className="cursor-pointer" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {signers.length === 0 && !formOpen && costSheetClosed && (
          <p className="text-xs text-muted-foreground">
            Todavía no emitiste ningún link. Sirve para que el cliente del evento dé su conformidad del cierre sin
            tener que crearle un proyecto ni una cuenta.
          </p>
        )}

        {signers.map((s) => (
          <div key={s.id} className="rounded-lg border p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {s.status === "firmado" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                ) : s.status === "invalidado" ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="font-medium truncate">
                  {s.signerName || s.invitedName || s.invitedEmail || s.roleLabel || "Firmante externo"}
                </span>
              </div>
              <Badge variant="secondary" className={`text-[10px] ${STATUS_STYLE[s.status]}`}>{s.status}</Badge>
            </div>

            {s.roleLabel && <p className="text-muted-foreground">{s.roleLabel}</p>}

            {s.signedAt ? (
              <div className="space-y-0.5 text-muted-foreground">
                <p>RUT {s.signerRut} · {s.signerEmail} · {s.signerPhone}</p>
                <p>Firmó el {fmt(s.signedAt)}{s.ipAddress ? ` · IP ${s.ipAddress}` : ""}</p>
                <p>Correo verificado con código el {fmt(s.otpVerifiedAt)}</p>
                {s.documentHash && <p className="break-all">Huella {s.documentHash.slice(0, 24)}…</p>}
                {s.status === "invalidado" && (
                  <p className="text-orange-600 pt-1">
                    {s.invalidatedReason ?? "El cierre se reabrió después de esta firma"}. La firma queda de
                    respaldo, pero ya no aprueba el cierre vigente -- hay que pedírsela de nuevo.
                  </p>
                )}
                <div className="flex items-center gap-1 flex-wrap mt-2">
                  {canCreate && s.status === "invalidado" && s.invitedEmail && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs cursor-pointer"
                      disabled={resending !== null}
                      onClick={() => resend(s)}
                      title="Emitir un link nuevo para el cierre actual y mandárselo"
                    >
                      {resending === s.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      ) : (
                        <Mail className="h-3.5 w-3.5 mr-1" />
                      )}
                      Pedir firma de nuevo
                    </Button>
                  )}
                <a
                  href={`/api/eventos/${showId}/external-signers/${s.id}/comprobante`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${buttonVariants({ variant: "outline", size: "sm" })} h-7 text-xs cursor-pointer`}
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Comprobante PDF
                </a>
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-muted-foreground">
                <p>
                  Emitido el {fmt(s.createdAt)} · vence el {fmt(s.expiresAt)}
                  {s.firstViewedAt ? ` · abierto el ${fmt(s.firstViewedAt)}` : " · sin abrir"}
                </p>
                {canCreate && s.status === "pendiente" && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {s.canCopyLink && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs cursor-pointer text-muted-foreground"
                        disabled={copying !== null}
                        onClick={() => copyExisting(s)}
                        title="Copiar este mismo link (no lo cambia)"
                      >
                        {copying === s.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 mr-1" />
                        )}
                        Copiar link
                      </Button>
                    )}
                    {s.invitedEmail && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs cursor-pointer text-muted-foreground"
                        disabled={resending !== null}
                        onClick={() => resend(s)}
                        title="Emitir un link nuevo y mandárselo por correo"
                      >
                        {resending === s.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <Mail className="h-3.5 w-3.5 mr-1" />
                        )}
                        Reenviar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs cursor-pointer text-muted-foreground" onClick={() => revoke(s)}>
                      <Ban className="h-3.5 w-3.5 mr-1" />
                      Anular link
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
