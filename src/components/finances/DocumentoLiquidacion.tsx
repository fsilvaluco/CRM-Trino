"use client";

import type { SettlementDocumentView } from "@/types/external-signature";
import { ComprobanteCostoButton } from "@/components/events/ComprobanteCostoButton";
import { formatSettlementAmount } from "@/lib/settlement-money";

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

/** Una liquidación tal cual se firma, de solo lectura (migración 109). Es
 * el equivalente de DocumentoCierre para regalías/merch/otro: lo usan la
 * pantalla de firma del equipo y la de la contraparte externa, así que se
 * ve igual en las dos.
 *
 * `resolveComprobante` decide cómo se abre cada adjunto: con la sesión por
 * dentro, con el token del link por fuera. Sin la prop no se muestran. */
export function DocumentoLiquidacion({
  doc,
  resolveComprobante,
}: {
  doc: SettlementDocumentView;
  resolveComprobante?: (path: string) => Promise<string | null>;
}) {
  const money = (n: number) => formatSettlementAmount(n, doc.currency);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{doc.typeLabel}</p>
        <p className="text-lg font-semibold leading-tight">
          {doc.payerName} → {doc.payeeName}
        </p>
        <p className="text-xs text-muted-foreground">
          {[doc.periodLabel ? `Periodo: ${doc.periodLabel}` : null, doc.projectName].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div className="border-t pt-3">
        <Row label="Paga" value={doc.payerName} />
        <Row label="Recibe" value={doc.payeeName} />
        <Row label="Moneda" value={doc.currency === "USD" ? "Dólares (USD)" : "Pesos chilenos (CLP)"} />
        <Row
          label="Monto de origen"
          value={money(doc.sourceAmount)}
          after={
            doc.sourceProofPath && resolveComprobante ? (
              <ComprobanteCostoButton path={doc.sourceProofPath} resolve={resolveComprobante} />
            ) : undefined
          }
        />
        <Row label="Porcentaje" value={`${doc.percentage}%`} />
        <Row
          label="Monto a pagar"
          value={money(doc.payoutAmount)}
          strong
          after={
            doc.payoutProofPath && resolveComprobante ? (
              <ComprobanteCostoButton path={doc.payoutProofPath} resolve={resolveComprobante} />
            ) : undefined
          }
        />
      </div>

      {doc.notes && (
        <div className="border-t pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Condiciones y notas
          </p>
          <p className="whitespace-pre-line text-sm">{doc.notes}</p>
        </div>
      )}
    </div>
  );
}
