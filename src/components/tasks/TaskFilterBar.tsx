"use client";

import { SlidersHorizontal, X, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { STATUS_LABELS } from "@/components/tasks/TaskKanbanBoard";
import type { TaskStatus, TaskPriority } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TaskFilters {
  status: TaskStatus | "all";
  priority: TaskPriority | "all";
  projectId: string;
  subprojectId: string;
  companyId: string;
  contactId: string;
  dealId: string;
  overdue: boolean;
  hasDueDate: boolean;
  hasNoDate: boolean;
  completed: "all" | "yes" | "no";
}

export type SortKey =
  | "default"
  | "alpha_asc"
  | "alpha_desc"
  | "due_asc"
  | "due_desc"
  | "created_asc"
  | "created_desc"
  | "priority"
  | "status";

export const DEFAULT_FILTERS: TaskFilters = {
  status: "all",
  priority: "all",
  projectId: "all",
  subprojectId: "all",
  companyId: "all",
  contactId: "all",
  dealId: "all",
  overdue: false,
  hasDueDate: false,
  hasNoDate: false,
  completed: "all",
};

export interface FilterOption {
  id: string;
  name: string;
}

export interface FilterOptions {
  projects: FilterOption[];
  subprojects: FilterOption[];
  companies: FilterOption[];
  contacts: FilterOption[];
  deals: FilterOption[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

const SORT_LABELS: Record<SortKey, string> = {
  default: "Por defecto",
  alpha_asc: "Nombre A → Z",
  alpha_desc: "Nombre Z → A",
  due_asc: "Vencimiento próximo",
  due_desc: "Vencimiento lejano",
  created_asc: "Más antiguas",
  created_desc: "Más nuevas",
  priority: "Por prioridad",
  status: "Por estado",
};

export function countActiveFilters(f: TaskFilters): number {
  let n = 0;
  if (f.status !== "all") n++;
  if (f.priority !== "all") n++;
  if (f.projectId !== "all") n++;
  if (f.subprojectId !== "all") n++;
  if (f.companyId !== "all") n++;
  if (f.contactId !== "all") n++;
  if (f.dealId !== "all") n++;
  if (f.overdue) n++;
  if (f.hasDueDate) n++;
  if (f.hasNoDate) n++;
  if (f.completed !== "all") n++;
  return n;
}

function buildChips(
  f: TaskFilters,
  opts: FilterOptions
): Array<{ key: string; label: string }> {
  const chips: Array<{ key: string; label: string }> = [];
  if (f.status !== "all") chips.push({ key: "status", label: `Estado: ${STATUS_LABELS[f.status]}` });
  if (f.priority !== "all") chips.push({ key: "priority", label: `Prioridad: ${PRIORITY_LABELS[f.priority]}` });
  if (f.projectId !== "all") {
    const name = opts.projects.find((p) => p.id === f.projectId)?.name ?? f.projectId;
    chips.push({ key: "projectId", label: `Proyecto: ${name}` });
  }
  if (f.subprojectId !== "all") {
    const name = opts.subprojects.find((p) => p.id === f.subprojectId)?.name ?? f.subprojectId;
    chips.push({ key: "subprojectId", label: `Subproyecto: ${name}` });
  }
  if (f.companyId !== "all") {
    const name = opts.companies.find((p) => p.id === f.companyId)?.name ?? f.companyId;
    chips.push({ key: "companyId", label: `Empresa: ${name}` });
  }
  if (f.contactId !== "all") {
    const name = opts.contacts.find((p) => p.id === f.contactId)?.name ?? f.contactId;
    chips.push({ key: "contactId", label: `Contacto: ${name}` });
  }
  if (f.dealId !== "all") {
    const name = opts.deals.find((p) => p.id === f.dealId)?.name ?? f.dealId;
    chips.push({ key: "dealId", label: `Deal: ${name}` });
  }
  if (f.overdue) chips.push({ key: "overdue", label: "Atrasadas" });
  if (f.hasDueDate) chips.push({ key: "hasDueDate", label: "Con vencimiento" });
  if (f.hasNoDate) chips.push({ key: "hasNoDate", label: "Sin vencimiento" });
  if (f.completed === "yes") chips.push({ key: "completed", label: "Completadas" });
  if (f.completed === "no") chips.push({ key: "completed", label: "No completadas" });
  return chips;
}

function removeChip(key: string, f: TaskFilters): TaskFilters {
  switch (key) {
    case "status":      return { ...f, status: "all" };
    case "priority":    return { ...f, priority: "all" };
    case "projectId":   return { ...f, projectId: "all" };
    case "subprojectId":return { ...f, subprojectId: "all" };
    case "companyId":   return { ...f, companyId: "all" };
    case "contactId":   return { ...f, contactId: "all" };
    case "dealId":      return { ...f, dealId: "all" };
    case "overdue":     return { ...f, overdue: false };
    case "hasDueDate":  return { ...f, hasDueDate: false };
    case "hasNoDate":   return { ...f, hasNoDate: false };
    case "completed":   return { ...f, completed: "all" };
    default:            return f;
  }
}

// ─── FilterPanel (popover content) ───────────────────────────────────────────

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      {children}
    </div>
  );
}

function FilterPanel({
  filters,
  onChange,
  options,
}: {
  filters: TaskFilters;
  onChange: (f: TaskFilters) => void;
  options: FilterOptions;
}) {
  function set<K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="space-y-4 p-1">
      <FilterSection label="Estado">
        <Select value={filters.status} onValueChange={(v) => set("status", (v ?? "all") as TaskStatus | "all")}>
          <SelectTrigger className="h-8 text-sm cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(STATUS_LABELS).map(([v, label]) => (
              <SelectItem key={v} value={v}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterSection>

      <FilterSection label="Prioridad">
        <Select value={filters.priority} onValueChange={(v) => set("priority", (v ?? "all") as TaskPriority | "all")}>
          <SelectTrigger className="h-8 text-sm cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="medium">Media</SelectItem>
            <SelectItem value="low">Baja</SelectItem>
          </SelectContent>
        </Select>
      </FilterSection>

      {options.projects.length > 0 && (
        <FilterSection label="Proyecto">
          <Select value={filters.projectId} onValueChange={(v) => set("projectId", v ?? "all")}>
            <SelectTrigger className="h-8 text-sm cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {options.projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {options.subprojects.length > 0 && (
        <FilterSection label="Subproyecto">
          <Select value={filters.subprojectId} onValueChange={(v) => set("subprojectId", v ?? "all")}>
            <SelectTrigger className="h-8 text-sm cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {options.subprojects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {options.companies.length > 0 && (
        <FilterSection label="Empresa">
          <Select value={filters.companyId} onValueChange={(v) => set("companyId", v ?? "all")}>
            <SelectTrigger className="h-8 text-sm cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {options.companies.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {options.contacts.length > 0 && (
        <FilterSection label="Contacto">
          <Select value={filters.contactId} onValueChange={(v) => set("contactId", v ?? "all")}>
            <SelectTrigger className="h-8 text-sm cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {options.contacts.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {options.deals.length > 0 && (
        <FilterSection label="Deal">
          <Select value={filters.dealId} onValueChange={(v) => set("dealId", v ?? "all")}>
            <SelectTrigger className="h-8 text-sm cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {options.deals.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      <FilterSection label="Fecha de vencimiento">
        <div className="space-y-1.5">
          {(
            [
              { key: "overdue" as const, label: "Sólo atrasadas" },
              { key: "hasDueDate" as const, label: "Con fecha de vencimiento" },
              { key: "hasNoDate" as const, label: "Sin fecha de vencimiento" },
            ] as const
          ).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters[key] as boolean}
                onChange={(e) => set(key, e.target.checked)}
                className="w-4 h-4 rounded accent-primary cursor-pointer"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </FilterSection>

      <FilterSection label="Completadas">
        <Select value={filters.completed} onValueChange={(v) => set("completed", (v ?? "all") as "all" | "yes" | "no")}>
          <SelectTrigger className="h-8 text-sm cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="no">No completadas</SelectItem>
            <SelectItem value="yes">Completadas</SelectItem>
          </SelectContent>
        </Select>
      </FilterSection>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TaskFilterBarProps {
  filters: TaskFilters;
  sortBy: SortKey;
  onFiltersChange: (f: TaskFilters) => void;
  onSortChange: (s: SortKey) => void;
  options: FilterOptions;
  totalCount: number;
  filteredCount: number;
}

export function TaskFilterBar({
  filters,
  sortBy,
  onFiltersChange,
  onSortChange,
  options,
  totalCount,
  filteredCount,
}: TaskFilterBarProps) {
  const activeCount = countActiveFilters(filters);
  const chips = buildChips(filters, options);
  const isFiltered = activeCount > 0;

  return (
    <div className="space-y-2">
      {/* Barra principal */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Botón Filtros */}
        <Popover>
          <PopoverTrigger
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-input bg-transparent text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filtros
            {activeCount > 0 && (
              <Badge className="ml-0.5 px-1.5 py-0 text-[10px] leading-5 bg-primary text-primary-foreground rounded-full">
                {activeCount}
              </Badge>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" side="bottom" className="w-80 max-h-[540px] overflow-y-auto">
            <FilterPanel filters={filters} onChange={onFiltersChange} options={options} />
          </PopoverContent>
        </Popover>

        {/* Selector de orden */}
        <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortKey)}>
          <SelectTrigger className="h-8 w-[190px] text-sm cursor-pointer gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Contador cuando hay filtros activos */}
        {isFiltered && (
          <span className="text-xs text-muted-foreground">
            {filteredCount} de {totalCount}
          </span>
        )}

        {/* Limpiar filtros */}
        {isFiltered && (
          <button
            onClick={() => onFiltersChange(DEFAULT_FILTERS)}
            className="inline-flex items-center gap-1 h-8 px-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </button>
        )}
      </div>

      {/* Chips de filtros activos */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              onClick={() => onFiltersChange(removeChip(chip.key, filters))}
              className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium hover:bg-primary/20 transition-colors cursor-pointer"
            >
              {chip.label}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
