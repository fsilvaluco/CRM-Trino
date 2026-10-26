"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, List, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocale } from "@/lib/locale-context";
import { SponsorshipCard } from "@/components/tours/SponsorshipCard";
import { SponsorshipSheet } from "@/components/tours/SponsorshipSheet";
import {
  SPONSORSHIP_CATEGORY_LABEL,
  SPONSORSHIP_COLUMNS,
  SPONSORSHIP_STATUS_CLASS,
  SPONSORSHIP_STATUS_LABEL,
  daysAgo,
  shortDate,
} from "@/components/tours/labels";
import type { SponsorshipCategory, TourDetail } from "@/types/tours";

const ALL = "__all";

function FilterSelect({ value, onChange, options, allLabel }: { value: string; onChange: (v: string) => void; options: [string, string][]; allLabel: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? ALL)}>
      <SelectTrigger className="h-8 w-40 cursor-pointer text-xs">
        <SelectValue>{value === ALL ? allLabel : options.find(([k]) => k === value)?.[1] ?? value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map(([k, l]) => (
          <SelectItem key={k} value={k}>{l}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SponsorshipsTab({ data, onChanged }: { data: TourDetail; onChanged: () => void }) {
  const { formatCurrency } = useLocale();
  const { tour, sponsorships, canEdit } = data;
  const [view, setView] = useState<"board" | "table">("board");
  const [category, setCategory] = useState(ALL);
  const [city, setCity] = useState(ALL);
  const [owner, setOwner] = useState(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const cities = useMemo(() => [...new Set(sponsorships.map((s) => s.city ?? "Toda la gira"))].sort(), [sponsorships]);
  const owners = useMemo(() => [...new Set(sponsorships.map((s) => s.responsibleName).filter(Boolean) as string[])].sort(), [sponsorships]);

  const rows = sponsorships.filter(
    (s) =>
      (category === ALL || s.category === category) &&
      (city === ALL || (s.city ?? "Toda la gira") === city) &&
      (owner === ALL || s.responsibleName === owner)
  );
  const selected = sponsorships.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect value={category} onChange={setCategory} allLabel="Todas las categorías"
          options={Object.entries(SPONSORSHIP_CATEGORY_LABEL) as [SponsorshipCategory, string][]} />
        <FilterSelect value={city} onChange={setCity} allLabel="Todas las ciudades" options={cities.map((c) => [c, c])} />
        <FilterSelect value={owner} onChange={setOwner} allLabel="Todos los responsables" options={owners.map((o) => [o, o])} />
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant={view === "board" ? "secondary" : "ghost"} onClick={() => setView("board")} className="cursor-pointer" title="Tablero">
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button size="icon" variant={view === "table" ? "secondary" : "ghost"} onClick={() => setView("table")} className="cursor-pointer" title="Tabla">
            <List className="h-4 w-4" />
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => setCreating(true)} className="cursor-pointer">
              <Plus className="h-4 w-4" /> Marca
            </Button>
          )}
        </div>
      </div>

      {view === "board" ? (
        <div className="grid gap-3 overflow-x-auto md:grid-cols-5">
          {SPONSORSHIP_COLUMNS.map((col) => {
            const items = rows.filter((s) => col.statuses.includes(s.status));
            return (
              <div key={col.key} className="min-w-[220px] space-y-2 rounded-xl bg-muted/40 p-2">
                <p className="px-1 text-xs font-medium text-muted-foreground">
                  {col.label} · {items.length}
                </p>
                {items.map((s) => (
                  <SponsorshipCard key={s.id} sp={s} onOpen={() => setSelectedId(s.id)} />
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                {["Marca", "Categoría", "Ciudad", "Estado", "Responsable", "Último contacto", "Próximo", "Valor"].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const since = daysAgo(s.lastContactAt ?? s.sentAt);
                const value = s.confirmedValue ?? s.estimatedValue;
                return (
                  <tr key={s.id} onClick={() => setSelectedId(s.id)} className="cursor-pointer border-t hover:bg-muted/40">
                    <td className="px-3 py-2 font-medium">{s.brand}</td>
                    <td className="px-3 py-2">{SPONSORSHIP_CATEGORY_LABEL[s.category]}</td>
                    <td className="px-3 py-2">{s.city ?? "Toda la gira"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs whitespace-nowrap ${SPONSORSHIP_STATUS_CLASS[s.status]}`}>{SPONSORSHIP_STATUS_LABEL[s.status]}</span>
                    </td>
                    <td className="px-3 py-2">{s.responsibleName ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{since === null ? "—" : since === 0 ? "Hoy" : `Hace ${since} d`}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{shortDate(s.nextFollowupAt)}</td>
                    <td className="px-3 py-2 tabular-nums">{value ? formatCurrency(value) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SponsorshipSheet
        tourId={tour.id}
        sp={creating ? null : selected}
        open={creating || Boolean(selected)}
        canEdit={canEdit}
        budgetLines={data.budget?.lines ?? null}
        onClose={() => {
          setCreating(false);
          setSelectedId(null);
        }}
        onSaved={onChanged}
      />
    </div>
  );
}
