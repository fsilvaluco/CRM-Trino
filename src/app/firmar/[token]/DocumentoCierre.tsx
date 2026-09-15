"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { ClosingDocumentView } from "@/types/external-signature";

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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1 ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums whitespace-nowrap">{value}</span>
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

/** El cierre de caja tal cual, de solo lectura -- es el documento que el
 * cliente externo está firmando, así que muestra exactamente lo mismo que
 * aprueban los firmantes internos en /eventos/[id]/firmar: no un resumen
 * más amable. */
export function DocumentoCierre({ doc }: { doc: ClosingDocumentView }) {
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
            <Row key={i} label={c.responsable ? `${c.label} — ${c.responsable}` : c.label} value={formatCents(c.amount)} />
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
