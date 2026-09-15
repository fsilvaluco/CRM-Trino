"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { CheckCircle2, Circle, Lock, Loader2, Mail, Send } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export interface ApprovalSigner {
  userId: string;
  fullName: string | null;
  email: string | null;
}

export interface ApprovalSignature extends ApprovalSigner {
  signedAt: string;
  ipAddress: string | null;
}

export interface ApprovalData {
  costSheetClosed: boolean;
  requiredSigners: ApprovalSigner[];
  eligibleSigners: ApprovalSigner[];
  requiredSignerIds: string[];
  canManageSigners: boolean;
  signatures: ApprovalSignature[];
  allSigned: boolean;
}

function fmt(iso: string) {
  try {
    return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

/**
 * Aprobación del cierre de caja: quiénes tienen que firmar, quiénes ya
 * firmaron, y los botones para pedir la firma por correo.
 *
 * Fuera de la Card de Costos a propósito: quien firma tiene que poder ver
 * quién falta aunque su rol no lo deje ver los montos de la Planilla. Sin
 * plata acá, solo nombres y checks -- igual que /eventos/[id]/firmar.
 *
 * Los checks son la selección a mano de la migración 101. El universo es
 * `eligibleSigners` (los que ven ingresos Y costos de Eventos en este
 * proyecto): no se puede obligar a aprobar números a alguien que no los
 * puede revisar. Con la lista vacía firman todos ellos -- el comportamiento
 * que había antes de poder elegir.
 */
export function ApprovalCard({
  showId,
  data,
  onReload,
}: {
  showId: string;
  data: ApprovalData;
  onReload: () => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  const signedIds = new Set(data.signatures.map((s) => s.userId));
  const requiredIds = new Set(data.requiredSigners.map((r) => r.userId));
  const signedRequired = data.requiredSigners.filter((r) => signedIds.has(r.userId));
  const pending = data.requiredSigners.filter((r) => !signedIds.has(r.userId));
  const canPickSigners = data.canManageSigners && data.eligibleSigners.length > 0;

  async function toggleSigner(userId: string, checked: boolean) {
    // Lista vacía en la base = "firman todos los que califican", así que el
    // punto de partida visible cuando nadie eligió es todos marcados.
    const current = data.requiredSignerIds.length > 0
      ? data.requiredSignerIds
      : data.eligibleSigners.map((e) => e.userId);
    const next = checked ? [...current, userId] : current.filter((uid) => uid !== userId);

    if (next.length === 0) {
      toast.error("Tiene que quedar al menos un firmante");
      return;
    }
    if (!checked && signedIds.has(userId)) {
      toast.error("Esa persona ya firmó -- su aprobación no se puede sacar");
      return;
    }

    setSaving(userId);
    try {
      const res = await fetch(`/api/eventos/${showId}/signatures`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requiredSignerIds: next }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "No se pudo guardar");
        return;
      }
      onReload();
    } catch {
      toast.error("No se pudo guardar");
    } finally {
      setSaving(null);
    }
  }

  async function notify(userId?: string) {
    setSending(userId ?? "all");
    try {
      const res = await fetch(`/api/eventos/${showId}/signatures/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userId ? { userId } : {}),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "No se pudo enviar");
        return;
      }
      const n = (body.sentTo ?? []).length;
      toast.success(n === 1 ? "Correo enviado" : `${n} correos enviados`);
      if ((body.failed ?? []).length > 0) {
        toast.warning(`No se pudo avisar a: ${body.failed.join(", ")}`);
      }
    } catch {
      toast.error("No se pudo enviar");
    } finally {
      setSending(null);
    }
  }

  return (
    <Card data-section="approval" className="no-print">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Lock className="h-4 w-4" />
          Aprobación
          <Badge
            variant="secondary"
            className={`text-xs ${data.allSigned ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
          >
            {data.allSigned ? "Aprobado por todos" : `${signedRequired.length}/${data.requiredSigners.length} firmaron`}
          </Badge>
        </CardTitle>
        {data.canManageSigners && data.costSheetClosed && pending.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs cursor-pointer"
            disabled={sending !== null}
            onClick={() => notify()}
            title="Mandarle el correo de solicitud de firma a todos los que faltan"
          >
            {sending === "all" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" />
            ) : (
              <Mail className="h-3.5 w-3.5 sm:mr-1" />
            )}
            <span className="hidden sm:inline">Enviar a todos</span>
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-1.5">
        {!data.costSheetClosed && (
          <p className="text-xs text-muted-foreground pb-1">
            La caja todavía no está cerrada -- nadie puede firmar aún, pero ya puedes elegir quiénes tendrán que
            hacerlo.
          </p>
        )}

        {data.eligibleSigners.map((person) => {
          const signature = data.signatures.find((s) => s.userId === person.userId);
          const isRequired = requiredIds.has(person.userId);
          const label = person.fullName || person.email || "Usuario";

          return (
            <div key={person.userId} className="flex items-center justify-between gap-2 text-xs">
              <div className={`flex items-center gap-1.5 min-w-0 ${isRequired ? "" : "opacity-50"}`}>
                {canPickSigners ? (
                  saving === person.userId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  ) : (
                    <Checkbox
                      className="cursor-pointer shrink-0"
                      checked={isRequired}
                      disabled={saving !== null}
                      onCheckedChange={(v) => toggleSigner(person.userId, v === true)}
                      aria-label={`${label} tiene que firmar`}
                    />
                  )
                ) : signature ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                {canPickSigners && signature && <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                <span className="truncate">{label}</span>
              </div>

              {signature ? (
                <span className="text-muted-foreground text-right shrink-0">
                  {fmt(signature.signedAt)}
                  {signature.ipAddress && <span className="block text-[10px] opacity-70">IP {signature.ipAddress}</span>}
                </span>
              ) : (
                isRequired &&
                data.canManageSigners &&
                data.costSheetClosed && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px] cursor-pointer text-muted-foreground shrink-0"
                    disabled={sending !== null}
                    onClick={() => notify(person.userId)}
                    title={`Mandarle el correo solo a ${label}`}
                  >
                    {sending === person.userId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-3 w-3 mr-1" />
                        Enviar
                      </>
                    )}
                  </Button>
                )
              )}
            </div>
          );
        })}

        {/* Firmantes "voluntarios" -- alguien que firmó sin estar en la
            lista de requeridos (o que la perdió después). Su aprobación
            quedó registrada igual, así que se muestra, solo que no cuenta
            para el "X/Y firmaron". */}
        {data.signatures
          .filter((s) => !data.eligibleSigners.some((e) => e.userId === s.userId))
          .map((s) => (
            <div key={s.userId} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                <span className="truncate">{s.fullName || s.email || "Usuario"}</span>
              </div>
              <span className="text-muted-foreground text-right shrink-0">
                {fmt(s.signedAt)}
                {s.ipAddress && <span className="block text-[10px] opacity-70">IP {s.ipAddress}</span>}
              </span>
            </div>
          ))}

        {canPickSigners && (
          <p className="text-[11px] text-muted-foreground pt-1.5">
            Marca quiénes tienen que firmar este cierre. Solo aparecen los que ven ingresos y costos de Eventos en
            este proyecto -- nadie aprueba números que no puede revisar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
