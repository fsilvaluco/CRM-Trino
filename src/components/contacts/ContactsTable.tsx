"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { Search, Users, Download, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/constants";
import { SOURCE_LABELS } from "@/lib/constants";
import type { Contact, LeadSource } from "@/types";

type SortKey = "name" | "company" | "source" | "project" | "date";

function SortableHead({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  className?: string;
}) {
  return (
    <TableHead className={className}>
      <button
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 cursor-pointer select-none hover:text-foreground",
          active ? "text-foreground font-medium" : "text-muted-foreground"
        )}
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active && dir === "desc" && "rotate-180")} />
      </button>
    </TableHead>
  );
}

interface ContactsTableProps {
  contacts: Contact[];
}

export function ContactsTable({ contacts }: ContactsTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filtered = contacts.filter((c) => {
    const matchesSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.company?.toLowerCase().includes(search.toLowerCase());

    return matchesSearch;
  });

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name, "es", { sensitivity: "base" }) * dir;
        case "company": {
          const ac = a.company || "";
          const bc = b.company || "";
          return ac.localeCompare(bc, "es", { sensitivity: "base" }) * dir;
        }
        case "source": {
          const as = SOURCE_LABELS[a.source as LeadSource] || a.source || "";
          const bs = SOURCE_LABELS[b.source as LeadSource] || b.source || "";
          return as.localeCompare(bs, "es", { sensitivity: "base" }) * dir;
        }
        case "project": {
          const ap = a.artistProjectName ?? a.projectName ?? "";
          const bp = b.artistProjectName ?? b.projectName ?? "";
          return ap.localeCompare(bp, "es", { sensitivity: "base" }) * dir;
        }
        case "date":
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
        default:
          return 0;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir]);

  if (contacts.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No hay contactos"
        description="Agrega tu primer contacto para comenzar a gestionar tu pipeline de ventas."
        actionLabel="Agregar contacto"
        onAction={() => router.push("/contacts?new=true")}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, email o empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open("/api/export?type=contacts")}
            className="cursor-pointer"
          >
            <Download className="h-4 w-4 mr-1" />
            Exportar
          </Button>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead
                label="Nombre"
                active={sortKey === "name"}
                dir={sortDir}
                onClick={() => toggleSort("name")}
              />
              <SortableHead
                label="Empresa"
                active={sortKey === "company"}
                dir={sortDir}
                onClick={() => toggleSort("company")}
                className="hidden sm:table-cell"
              />
              <SortableHead
                label="Fuente"
                active={sortKey === "source"}
                dir={sortDir}
                onClick={() => toggleSort("source")}
                className="hidden md:table-cell"
              />
              <SortableHead
                label="Proyecto"
                active={sortKey === "project"}
                dir={sortDir}
                onClick={() => toggleSort("project")}
                className="hidden md:table-cell"
              />
              <SortableHead
                label="Fecha"
                active={sortKey === "date"}
                dir={sortDir}
                onClick={() => toggleSort("date")}
                className="hidden lg:table-cell"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((contact) => (
              <TableRow
                key={contact.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/contacts/${contact.id}`)}
              >
                <TableCell>
                  <div>
                    <p className="font-medium">{contact.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {contact.email || "Sin email"}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {contact.company || (contact.companyId ? "Empresa vinculada" : "-")}
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm">
                  {SOURCE_LABELS[contact.source as LeadSource] || contact.source}
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm">
                  {contact.artistProjectName ?? contact.projectName ?? "-"}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                  {formatDate(contact.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        {filtered.length} de {contacts.length} contactos
      </p>
    </div>
  );
}
