"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { ClosingDocumentView } from "@/types/external-signature";
import { ComprobanteCostoButton } from "@/components/events/ComprobanteCostoButton";

const CLP = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return CLP.format(cents / 100);
}

function formatDate(d: string) {
  try {
    return format(new Date(`${d}T00:00:00`), "EEEE d 'de' MMMM yyyy", { locale: es });
  } catch {
    return d;
  }
}

function Row({
  label,
  value,
  strong,
  after,
}: {
  label: string;
  value: string;
  strong?: boolean;
  after?: React.ReactNode;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1 ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        <span className="tabular-nums whitespace-nowrap">{value}</span>
        {after}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{title}</p>
      {children}
    </div>
  );
}

/** El cierre de caja tal cual, de solo lectura. Lo usan LAS DOS pantallas
 * de firma (la del equipo y la del cliente externo) -- es el mismo
 * documento, así que se ve igual en las dos: no hay una versión "más
 * amable" para nadie.
 *
 * `resolveComprobante` es lo único que cambia entre ambas -- cómo se
 * consigue la URL firmada de cada boleta. Sin esa prop, los costos se
 * muestran igual pero sin el ícono para abrirlas. */
export function DocumentoCierre({
  doc,
  resolveComprobante,
}: {
  doc: ClosingDocumentView;
  resolveComprobante?: (path: string) => Promise<string | null>;
}) {
  const projectPct = doc.profitSplitProjectPct;
  const trinoPct = doc.profitSplitTrinoPct;

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-lg font-semibold leading-tight">{doc.eventName}</p>
        <p className="text-xs text-muted-foreground capitalize">
          {formatDate(doc.date)} · {doc.venue}
          {doc.city ? `, ${doc.city}` : ""}
        </p>
      </div>

      <div>
        <Row label="Fee / caché" value={formatCents(doc.fee)} />
        <Row label="Venta de entradas" value={formatCents(doc.ticketIncome)} />
        <Row label="Total ingresos" value={formatCents(doc.ingresos)} strong />
        <Row label="Total egresos" value={formatCents(doc.expenses)} />
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t pt-2">
          <span className="font-semibold">Utilidad</span>
          <span className={`text-base font-bold tabular-nums ${doc.utilidad >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatCents(doc.utilidad)}
          </span>
        </div>
      </div>

      {doc.ticketTiers.length > 0 && (
        <Section title="Venta de entradas">
          {doc.ticketTiers.map((t, i) => (
            <Row
              key={i}
              label={`${t.label} — ${t.quantitySold} × ${formatCents(t.unitPrice)}`}
              value={formatCents(t.unitPrice * t.quantitySold)}
            />
          ))}
        </Section>
      )}

      {doc.costItems.length > 0 && (
        <Section title="Costos">
          {doc.costItems.map((c, i) => (
            <Row
              key={i}
              label={c.responsable ? `${c.label} — ${c.responsable}` : c.label}
              value={formatCents(c.amount)}
              after={
                c.comprobanteUrl && resolveComprobante ? (
                  <ComprobanteCostoButton path={c.comprobanteUrl} resolve={resolveComprobante} />
                ) : null
              }
            />
          ))}
        </Section>
      )}

      {(projectPct != null || trinoPct != null || doc.profitSplitNote) && (
        <Section title="Reparto de utilidad">
          {projectPct != null && (
            <Row
              label={`${projectPct}% ${doc.profitSplitProjectLabel}`}
              value={formatCents(Math.round((doc.utilidad * projectPct) / 100))}
            />
          )}
          {trinoPct != null && (
            <Row
              label={`${trinoPct}% ${doc.profitSplitTrinoLabel}`}
              value={formatCents(Math.round((doc.utilidad * trinoPct) / 100))}
            />
          )}
          {doc.profitSplitNote && (
            <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{doc.profitSplitNote}</p>
          )}
        </Section>
      )}
    </div>
  );
}
