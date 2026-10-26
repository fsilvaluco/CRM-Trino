"use client";

import { Clock, ExternalLink, MapPin } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { SPONSORSHIP_CATEGORY_LABEL, SPONSORSHIP_STATUS_CLASS, SPONSORSHIP_STATUS_LABEL, daysAgo } from "@/components/tours/labels";
import type { Sponsorship } from "@/types/tours";

export function SponsorshipCard({ sp, onOpen }: { sp: Sponsorship; onOpen: () => void }) {
  const { formatCurrency } = useLocale();
  const since = daysAgo(sp.lastContactAt ?? sp.sentAt);
  const stale = sp.status === "enviada" && since !== null && since > 5;
  const value = sp.confirmedValue ?? sp.estimatedValue;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="cursor-pointer space-y-1.5 rounded-lg border bg-card p-3 text-left hover:border-primary/50"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-tight">{sp.brand}</p>
        {sp.dossierUrl && (
          <a href={sp.dossierUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Abrir dossier" className="text-muted-foreground hover:text-primary">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className={`rounded px-1.5 py-0.5 ${SPONSORSHIP_STATUS_CLASS[sp.status]}`}>{SPONSORSHIP_STATUS_LABEL[sp.status]}</span>
        <span className="text-muted-foreground">{SPONSORSHIP_CATEGORY_LABEL[sp.category]}</span>
        {sp.city && (
          <span className="inline-flex items-center gap-0.5 text-muted-foreground">
            <MapPin className="h-3 w-3" /> {sp.city}
          </span>
        )}
      </div>
      {sp.request && <p className="line-clamp-2 text-xs text-muted-foreground">{sp.request}</p>}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className={`inline-flex items-center gap-1 ${stale ? "font-medium text-red-600" : ""}`}>
          {since !== null && (
            <>
              <Clock className="h-3 w-3" /> {since === 0 ? "hoy" : `hace ${since} d`}
            </>
          )}
        </span>
        <span>
          {sp.responsibleName ?? ""}
          {value ? ` · ${formatCurrency(value)}` : ""}
        </span>
      </div>
    </div>
  );
}
