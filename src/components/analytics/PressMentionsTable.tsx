"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2, Loader2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { PRESS_TYPE_LABELS, PRESS_SOURCE_LABELS, type PressMention, type PressMentionType, type PressMentionSource } from "@/types/press";

interface PressMentionsTableProps {
  mentions: PressMention[];
  onEdit: (mention: PressMention) => void;
  onDeleted: () => void;
}

const SOURCE_BADGE_VARIANT: Record<PressMentionSource, "default" | "secondary" | "outline"> = {
  earned: "default",
  own: "secondary",
  partner: "outline",
};

export function PressMentionsTable({ mentions, onEdit, onDeleted }: PressMentionsTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<PressMentionType | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<PressMentionSource | "all">("all");

  const filtered = useMemo(
    () =>
      mentions.filter((m) => (typeFilter === "all" || m.type === typeFilter) && (sourceFilter === "all" || m.source === sourceFilter)),
    [mentions, typeFilter, sourceFilter]
  );

  const handleDelete = async (mention: PressMention) => {
    if (!confirm(`¿Eliminar la mención de "${mention.outlet}"?`)) return;
    setDeletingId(mention.id);
    try {
      const res = await fetch(`/api/analytics/press/${mention.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Mención eliminada");
        onDeleted();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Error al eliminar");
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as PressMentionType | "all")}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {(Object.keys(PRESS_TYPE_LABELS) as PressMentionType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {PRESS_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as PressMentionSource | "all")}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las fuentes</SelectItem>
            {(Object.keys(PRESS_SOURCE_LABELS) as PressMentionSource[]).map((s) => (
              <SelectItem key={s} value={s}>
                {PRESS_SOURCE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground ml-auto">{filtered.length} de {mentions.length}</p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Sin menciones que calcen con el filtro.
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Fecha</TableHead>
                <TableHead>Medio</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fuente</TableHead>
                <TableHead>Campaña</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {m.mentionDate ? format(new Date(`${m.mentionDate}T00:00:00`), "d MMM yyyy", { locale: es }) : "Sin fecha"}
                  </TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{m.outlet}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{PRESS_TYPE_LABELS[m.type]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={SOURCE_BADGE_VARIANT[m.source]}>{PRESS_SOURCE_LABELS[m.source]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {m.campaignName ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-md text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="line-clamp-2">{m.title}</span>
                      {m.referenceUrl && (
                        <a href={m.referenceUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(m)}
                        disabled={deletingId === m.id}
                      >
                        {deletingId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
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
