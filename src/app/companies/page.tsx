"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { CompanyForm } from "@/components/companies/CompanyForm";
import {
  Building2,
  Plus,
  Search,
  Users,
  Briefcase,
  Globe,
  Mail,
  Phone,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { formatDate } from "@/lib/constants";

interface CompanyRow {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  contactCount: number;
  dealCount: number;
  createdAt: number | Date;
}

// ── Sorting ──────────────────────────────────────────────────────────────────
type SortField = "name" | "industry" | "email" | "contactCount" | "dealCount" | "createdAt";
type SortDir = "asc" | "desc";

function sortCompanies(list: CompanyRow[], field: SortField | null, dir: SortDir): CompanyRow[] {
  if (!field) return list;
  return [...list].sort((a, b) => {
    let valA: string | number;
    let valB: string | number;
    switch (field) {
      case "name":         valA = a.name.toLowerCase();           valB = b.name.toLowerCase();           break;
      case "industry":     valA = (a.industry ?? "").toLowerCase(); valB = (b.industry ?? "").toLowerCase(); break;
      case "email":        valA = (a.email ?? "").toLowerCase();    valB = (b.email ?? "").toLowerCase();    break;
      case "contactCount": valA = a.contactCount;                  valB = b.contactCount;                  break;
      case "dealCount":    valA = a.dealCount;                     valB = b.dealCount;                     break;
      case "createdAt":    valA = +new Date(a.createdAt);          valB = +new Date(b.createdAt);          break;
    }
    if (valA < valB) return dir === "asc" ? -1 : 1;
    if (valA > valB) return dir === "asc" ? 1 : -1;
    return 0;
  });
}

// ── Column resizing ───────────────────────────────────────────────────────────
const COL_KEYS = ["empresa", "contacto", "website", "contactos", "deals", "creada", "arrow"] as const;
type ColKey = (typeof COL_KEYS)[number];

const DEFAULT_WIDTHS: Record<ColKey, number> = {
  empresa:   240,
  contacto:  200,
  website:   180,
  contactos: 100,
  deals:      90,
  creada:    120,
  arrow:      40,
};
const MIN_COL_WIDTH = 60;

// ── SortableHead component ────────────────────────────────────────────────────
interface SortableHeadProps {
  children: React.ReactNode;
  field?: SortField;
  colKey: ColKey;
  sortField: SortField | null;
  sortDir: SortDir;
  colWidths: Record<ColKey, number>;
  onSort: (f: SortField) => void;
  onResizeStart: (e: React.MouseEvent, col: ColKey) => void;
}

function SortableHead({
  children,
  field,
  colKey,
  sortField,
  sortDir,
  colWidths,
  onSort,
  onResizeStart,
}: SortableHeadProps) {
  const isActive = field && sortField === field;
  return (
    <TableHead style={{ width: colWidths[colKey], minWidth: MIN_COL_WIDTH, position: "relative" }}>
      <div
        className={`flex items-center gap-1 select-none ${field ? "cursor-pointer hover:text-foreground" : ""}`}
        onClick={field ? () => onSort(field) : undefined}
      >
        {children}
        {field && (
          isActive ? (
            sortDir === "asc"
              ? <ArrowUp className="h-3.5 w-3.5 shrink-0" />
              : <ArrowDown className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
          )
        )}
      </div>
      {/* Drag handle para redimensionar */}
      <div
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 rounded transition-colors"
        onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, colKey); }}
      />
    </TableHead>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CompaniesPage() {
  const router = useRouter();
  const [companiesList, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [colWidths, setColWidths] = useState<Record<ColKey, number>>(DEFAULT_WIDTHS);
  const resizingRef = useRef<{ col: ColKey; startX: number; startWidth: number } | null>(null);

  const loadCompanies = (q = "") => {
    const params = q ? `?search=${encodeURIComponent(q)}` : "";
    fetch(`/api/companies${params}`)
      .then((r) => r.json())
      .then((data) => { setCompanies(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadCompanies(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadCompanies(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const handleResizeStart = (e: React.MouseEvent, col: ColKey) => {
    e.preventDefault();
    resizingRef.current = { col, startX: e.clientX, startWidth: colWidths[col] };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const newWidth = Math.max(MIN_COL_WIDTH, resizingRef.current.startWidth + ev.clientX - resizingRef.current.startX);
      setColWidths((prev) => ({ ...prev, [resizingRef.current!.col]: newWidth }));
    };

    const onMouseUp = () => {
      resizingRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const sortedList = sortCompanies(companiesList, sortField, sortDir);

  const headProps = { sortField, sortDir, colWidths, onSort: handleSort, onResizeStart: handleResizeStart };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Empresas</h1>
        <div className="rounded-lg border divide-y">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 px-4 flex items-center gap-4">
              <div className="h-8 w-8 bg-muted rounded-md animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-40 bg-muted rounded animate-pulse" />
                <div className="h-3 w-24 bg-muted rounded animate-pulse" />
              </div>
              <div className="h-3 w-20 bg-muted rounded animate-pulse" />
              <div className="h-3 w-20 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Empresas</h1>
          <p className="text-muted-foreground">
            {companiesList.length} empresa{companiesList.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} className="cursor-pointer">
          <Plus className="h-4 w-4 mr-2" />
          Nueva Empresa
        </Button>
      </div>

      <CompanyForm
        open={showForm}
        onClose={() => { setShowForm(false); loadCompanies(search); }}
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar empresas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {companiesList.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Sin empresas"
          description="Crea tu primera empresa para organizar contactos y deals por organizacion."
          actionLabel="Nueva Empresa"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div className="rounded-lg border">
          <Table style={{ tableLayout: "fixed" }}>
            <TableHeader>
              <TableRow>
                <SortableHead {...headProps} field="name"         colKey="empresa">Empresa</SortableHead>
                <SortableHead {...headProps} field="email"        colKey="contacto">Contacto</SortableHead>
                <SortableHead {...headProps}                      colKey="website">Sitio web</SortableHead>
                <SortableHead {...headProps} field="contactCount" colKey="contactos">Contactos</SortableHead>
                <SortableHead {...headProps} field="dealCount"    colKey="deals">Deals</SortableHead>
                <SortableHead {...headProps} field="createdAt"    colKey="creada">Creada</SortableHead>
                <TableHead style={{ width: colWidths.arrow, minWidth: 40 }} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedList.map((company) => (
                <TableRow
                  key={company.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => router.push(`/companies/${company.id}`)}
                >
                  {/* Nombre + industria */}
                  <TableCell style={{ width: colWidths.empresa }}>
                    <div className="flex items-center gap-3">
                      <div className="rounded-md bg-primary/10 p-2 shrink-0">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{company.name}</p>
                        {company.industry && (
                          <p className="text-xs text-muted-foreground truncate">{company.industry}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Email o teléfono */}
                  <TableCell style={{ width: colWidths.contacto }}>
                    {company.email ? (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{company.email}</span>
                      </span>
                    ) : company.phone ? (
                      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{company.phone}</span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground/40">—</span>
                    )}
                  </TableCell>

                  {/* Sitio web */}
                  <TableCell style={{ width: colWidths.website }}>
                    {company.website ? (
                      <span
                        className="flex items-center gap-1.5 text-sm text-primary hover:underline cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(
                            company.website!.startsWith("http") ? company.website! : `https://${company.website}`,
                            "_blank",
                            "noopener,noreferrer"
                          );
                        }}
                      >
                        <Globe className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{company.website}</span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground/40">—</span>
                    )}
                  </TableCell>

                  {/* Contactos */}
                  <TableCell style={{ width: colWidths.contactos }}>
                    <span className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {company.contactCount}
                    </span>
                  </TableCell>

                  {/* Deals */}
                  <TableCell style={{ width: colWidths.deals }}>
                    <span className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                      <Briefcase className="h-3.5 w-3.5" />
                      {company.dealCount}
                    </span>
                  </TableCell>

                  {/* Fecha */}
                  <TableCell style={{ width: colWidths.creada }} className="text-sm text-muted-foreground">
                    {formatDate(company.createdAt)}
                  </TableCell>

                  {/* Flecha */}
                  <TableCell style={{ width: colWidths.arrow }}>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
