"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Circle, Loader2, ArrowLeft, Lock, ShieldAlert, Receipt, Banknote } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { CostItem, TicketTier } from "@/types/shows";
import { useAuth } from "@/lib/auth-context";
import { SignedFileLink } from "@/components/finances/SignedFileLink";

const CLP = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return CLP.format(cents / 100);
}

function formatDate(d: string) {
  try {
    return format(new Date(`${d}T00:00:00`), "EEEE d MMM yyyy", { locale: es });
  } catch {
    return d;
  }
}

function formatSignedAt(iso: string) {
  try {
    return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

interface Signer {
  userId: string;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
}

interface Signature extends Signer {
  signedAt: string;
}

interface SignaturesData {
  eventName: string;
  costSheetClosed: boolean;
  requiredSigners: Signer[];
  signatures: Signature[];
  allSigned: boolean;
  alreadySigned: boolean;
  canSign: boolean;
}

interface EventSummary {
  name: string;
  date: string;
  venue: string;
  fee: number | null;
  ticketIncome: number | null;
  expenses: number | null;
  projectName: string | null;
  profitSplitNote: string | null;
  profitSplitProjectPct: number | null;
  profitSplitTrinoPct: number | null;
  profitSplitTransferProofUrl: string | null;
  profitSplitTransferredAt: string | null;
  costItems: CostItem[];
  ticketTiers: TicketTier[];
}

// Pagina liviana, de solo-lectura + firmar -- pensada para compartir el
// link con el resto del proyecto (Configuración > ...no, se comparte
// directo desde el boton de la planilla de Costos). A proposito NO
// reutiliza la pagina completa de edicion del evento (esa tiene timing,
// setlist, riders, etc. -- de mas para alguien que solo necesita revisar
// los costos y aprobar el cierre). El control de acceso real (solo
// project_members de este evento) lo hace la API, no esta pagina.
export default function FirmarClient() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [sig, setSig] = useState<SignaturesData | null>(null);
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [signing, setSigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    try {
      const sigRes = await fetch(`/api/eventos/${id}/signatures`);
      if (sigRes.status === 403) {
        setForbidden(true);
        return;
      }
      if (!sigRes.ok) throw new Error();
      const sigData: SignaturesData = await sigRes.json();
      setSig(sigData);

      const eventRes = await fetch(`/api/eventos/${id}`);
      if (eventRes.ok) setEvent(await eventRes.json());
    } catch {
      toast.error("No se pudo cargar la información del cierre");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSign() {
    const confirmed = window.confirm(
      "¿Estás de acuerdo con el cierre de caja de este evento? Esta es una acción irreversible -- tu aprobación queda registrada con tu nombre, correo y la hora exacta."
    );
    if (!confirmed) return;

    setSigning(true);
    try {
      const res = await fetch(`/api/eventos/${id}/signatures`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo firmar");
      toast.success("Quedaste registrado como aprobado");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo firmar");
    } finally {
      setSigning(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-16 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-3">
        <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="font-medium">Sin acceso</p>
        <p className="text-sm text-muted-foreground">
          Solo los integrantes del proyecto de este evento pueden ver su cierre de caja.
        </p>
      </div>
    );
  }

  if (!sig) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <p className="text-sm text-muted-foreground">Evento no encontrado.</p>
      </div>
    );
  }

  const utilidadCents = event ? (event.fee ?? 0) + (event.ticketIncome ?? 0) - (event.expenses ?? 0) : 0;
  const resolvedProjectPct = event?.profitSplitProjectPct ?? 70;
  const resolvedTrinoPct = event?.profitSplitTrinoPct ?? 30;
  const projectSplitCents = Math.round((utilidadCents * resolvedProjectPct) / 100);
  const trinoSplitCents = Math.round((utilidadCents * resolvedTrinoPct) / 100);
  const resolvedNote = event?.profitSplitNote?.trim() || "";
  const ticketTotalCents = (event?.ticketTiers ?? []).reduce((sum, t) => sum + t.unitPrice * t.quantitySold, 0);

  // Nombre para "Yo, [nombre], estoy de acuerdo" -- se busca primero entre
  // los firmantes/firmas (traen el full_name real de profiles), y si el
  // usuario actual no aparece ahí (ej. un admin de la org que firma sin
  // ser firmante requerido) se cae al nombre/email de la sesión.
  const currentSignerName =
    sig?.requiredSigners.find((r) => r.userId === user?.id)?.fullName ||
    sig?.signatures.find((s) => s.userId === user?.id)?.fullName ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email ||
    "Usuario";

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <Link href={`/eventos/${id}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-fit">
        <ArrowLeft className="h-4 w-4" />
        Volver al evento
      </Link>

      <div>
        <h1 className="text-xl font-bold tracking-tight">Cierre de caja -- {sig.eventName}</h1>
        {event && (
          <p className="text-sm text-muted-foreground capitalize mt-1">
            {formatDate(event.date)} · {event.venue}
          </p>
        )}
      </div>

      {!sig.costSheetClosed ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            La caja de este evento todavía no está cerrada -- no hay nada que aprobar por ahora.
          </CardContent>
        </Card>
      ) : (
        <>
          {event && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Resumen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Ingresos</p>
                    <p className="font-semibold">{formatCents((event.fee ?? 0) + (event.ticketIncome ?? 0))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Egresos</p>
                    <p className="font-semibold">{formatCents(event.expenses)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Utilidad</p>
                    <p className="font-semibold">{formatCents(utilidadCents)}</p>
                  </div>
                </div>

                {event.ticketTiers.length > 0 && (
                  <div className="border-t pt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground">
                          <th className="text-left font-normal pb-1.5">Tipo de entrada</th>
                          <th className="text-right font-normal pb-1.5">Cantidad vendida</th>
                          <th className="text-right font-normal pb-1.5">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {event.ticketTiers.map((t) => (
                          <tr key={t.id} className="border-t">
                            <td className="py-1.5 pr-2">{t.label}</td>
                            <td className="py-1.5 text-right">{t.quantitySold}</td>
                            <td className="py-1.5 text-right font-medium whitespace-nowrap">{formatCents(t.unitPrice * t.quantitySold)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t font-semibold">
                          <td className="py-1.5" colSpan={2}>Total ingresos</td>
                          <td className="py-1.5 text-right whitespace-nowrap">{formatCents(ticketTotalCents)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {event.costItems.length > 0 && (
                  <div className="border-t pt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground">
                          <th className="text-left font-normal pb-1.5">Detalle</th>
                          <th className="text-right font-normal pb-1.5">Monto</th>
                          <th className="text-center font-normal pb-1.5">Comprobante de cobro</th>
                          <th className="text-center font-normal pb-1.5">Comprobante de pago</th>
                        </tr>
                      </thead>
                      <tbody>
                        {event.costItems.map((c) => (
                          <tr key={c.id} className="border-t">
                            <td className="py-1.5 pr-2">
                              {c.label}
                              {c.responsable ? <span className="text-muted-foreground"> -- {c.responsable}</span> : null}
                            </td>
                            <td className="py-1.5 text-right font-medium whitespace-nowrap">{formatCents(c.amount)}</td>
                            <td className="py-1.5 text-center">
                              {c.comprobanteUrl ? (
                                <SignedFileLink
                                  path={c.comprobanteUrl}
                                  className="inline-flex items-center justify-center h-7 w-7 rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted"
                                  title="Ver comprobante de cobro (boleta/factura)"
                                >
                                  <Receipt className="h-3.5 w-3.5" />
                                </SignedFileLink>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-1.5 text-center">
                              {c.comprobantePagoUrl ? (
                                <SignedFileLink
                                  path={c.comprobantePagoUrl}
                                  className="inline-flex items-center justify-center h-7 w-7 rounded-md border text-muted-foreground hover:text-foreground hover:bg-muted"
                                  title="Ver comprobante de pago (transferencia)"
                                >
                                  <Banknote className="h-3.5 w-3.5" />
                                </SignedFileLink>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="border-t pt-3 space-y-1.5">
                  <p className="text-xs text-muted-foreground">Reparto de utilidad -- para transferir después de aprobar</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">{resolvedProjectPct}% {event?.projectName || "Proyecto"}</p>
                      <p className="font-semibold">{formatCents(projectSplitCents)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{resolvedTrinoPct}% Sello</p>
                      <p className="font-semibold">{formatCents(trinoSplitCents)}</p>
                    </div>
                  </div>
                  {resolvedNote && (
                    <p className="text-sm text-muted-foreground text-justify">
                      <span className="font-medium text-foreground">Nota:</span> {resolvedNote}
                    </p>
                  )}
                  {event?.profitSplitTransferProofUrl ? (
                    <SignedFileLink
                      path={event.profitSplitTransferProofUrl}
                      className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Ya se transfirió -- ver comprobante
                    </SignedFileLink>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Todavía no se ha subido el comprobante de la transferencia.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Aprobación
                <Badge variant="secondary" className={sig.allSigned ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}>
                  {sig.allSigned
                    ? "Aprobado por todos"
                    : `${sig.requiredSigners.filter((r) => sig.signatures.some((s) => s.userId === r.userId)).length}/${sig.requiredSigners.length} firmaron`}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {sig.requiredSigners.map((r) => {
                  const signature = sig.signatures.find((s) => s.userId === r.userId);
                  return (
                    <div key={r.userId} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {signature ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span>{r.fullName || r.email || "Usuario"}</span>
                      </div>
                      {signature && (
                        <span className="text-xs text-muted-foreground">{formatSignedAt(signature.signedAt)}</span>
                      )}
                    </div>
                  );
                })}
                {/* Firmantes "voluntarios" -- ej. un admin de la org que
                    firmó sin ser de los requeridos para este proyecto
                    puntual. Igual queda su aprobación registrada. */}
                {sig.signatures
                  .filter((s) => !sig.requiredSigners.some((r) => r.userId === s.userId))
                  .map((s) => (
                    <div key={s.userId} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                        <span>{s.fullName || s.email || "Usuario"}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatSignedAt(s.signedAt)}</span>
                    </div>
                  ))}
              </div>

              {sig.alreadySigned ? (
                <p className="text-sm text-green-700 bg-green-50 rounded-lg p-3">
                  Ya aprobaste este cierre.
                </p>
              ) : sig.canSign ? (
                <Button onClick={handleSign} disabled={signing} className="w-full cursor-pointer">
                  {signing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Yo, {currentSignerName}, estoy de acuerdo. Firmo.
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No eres parte del equipo requerido para aprobar este cierre.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
