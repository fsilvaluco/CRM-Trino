"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Users } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export interface ApprovalSummaryPerson {
  name: string;
  detail?: string | null;
  signedAt: string | null;
  /** Se resalta como "tú" en la lista. */
  isMe?: boolean;
}

function fmt(iso: string) {
  try {
    return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: es });
  } catch {
    return iso;
  }
}

function Row({ person }: { person: ApprovalSummaryPerson }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-1.5 min-w-0">
        {person.signedAt ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
        ) : (
          <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="truncate">
          {person.name}
          {person.isMe && <span className="text-muted-foreground"> (tú)</span>}
        </span>
        {person.detail && <span className="text-muted-foreground truncate hidden sm:inline">· {person.detail}</span>}
      </div>
      <span className="text-muted-foreground shrink-0">
        {person.signedAt ? fmt(person.signedAt) : "Pendiente"}
      </span>
    </div>
  );
}

/**
 * Recuadro de Aprobación de solo lectura para las DOS pantallas de firma:
 * quiénes firman este cierre y cuáles ya lo hicieron. Junta las firmas del
 * equipo con las externas porque es el mismo documento -- quien lo firma
 * tiene derecho a saber quién más lo está firmando.
 *
 * La versión con checks para elegir firmantes es ApprovalCard, en la ficha
 * del evento; esta solo muestra.
 */
export function ApprovalSummary({
  team,
  external,
}: {
  team: ApprovalSummaryPerson[];
  external: ApprovalSummaryPerson[];
}) {
  const todos = [...team, ...external];
  if (todos.length === 0) return null;

  const firmaron = todos.filter((p) => p.signedAt).length;
  const completo = firmaron === todos.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          Aprobación
          <Badge
            variant="secondary"
            className={`text-xs ${completo ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
          >
            {completo ? "Firmado por todos" : `${firmaron}/${todos.length} firmaron`}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {team.length > 0 && (
          <>
            {external.length > 0 && (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Equipo</p>
            )}
            {team.map((p, i) => (
              <Row key={`t-${i}`} person={p} />
            ))}
          </>
        )}
        {external.length > 0 && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-1.5">
              Contraparte
            </p>
            {external.map((p, i) => (
              <Row key={`e-${i}`} person={p} />
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
