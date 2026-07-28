"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { useLocale } from "@/lib/locale-context";
import type { PipelineColumn } from "@/types";

interface DealRow {
  id: string;
  title: string;
  value: number;
  valueType: "fixed" | "percentage";
  percentageValue: number | null;
  taxType: "afecto" | "exento";
  probability: number;
  contactName: string | null;
  stageName: string | null;
  stageColor: string | null;
  expectedClose: number | null;
  createdAt: number;
}

interface CrmTabsProps {
  columns: PipelineColumn[];
  allDeals: DealRow[];
  onDealMoved: () => void;
  onAddDeal?: (stageId: string) => void;
  onDealClick?: (dealId: string) => void;
}

export function CrmTabs({ columns, allDeals, onDealMoved, onAddDeal, onDealClick }: CrmTabsProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"kanban" | "lista">("kanban");
  const { formatCurrency, formatDate } = useLocale();

  type SortKey = "title" | "contactName" | "value" | "stageName" | "probability" | "expectedClose";
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const dir = sortDir === "asc" ? 1 : -1;
  const sortedDeals = [...allDeals].sort((a, b) => {
    switch (sortKey) {
      case "title":
        return a.title.localeCompare(b.title, "es", { sensitivity: "base" }) * dir;
      case "contactName":
        return (a.contactName ?? "").localeCompare(b.contactName ?? "", "es", { sensitivity: "base" }) * dir;
      case "stageName":
        return (a.stageName ?? "").localeCompare(b.stageName ?? "", "es", { sensitivity: "base" }) * dir;
      case "value":
        return ((a.value ?? 0) - (b.value ?? 0)) * dir;
      case "probability":
        return (a.probability - b.probability) * dir;
      case "expectedClose": {
        const av = a.expectedClose ? new Date(a.expectedClose).getTime() : 0;
        const bv = b.expectedClose ? new Date(b.expectedClose).getTime() : 0;
        return (av - bv) * dir;
      }
      default:
        return 0;
    }
  });

  function SortableHead({ label, field, className }: { label: string; field: SortKey; className?: string }) {
    const active = sortKey === field;
    return (
      <TableHead className={className}>
        <button
          onClick={() => toggleSort(field)}
          className={cn(
            "inline-flex items-center gap-1 cursor-pointer select-none hover:text-foreground",
            active ? "text-foreground font-medium" : "text-muted-foreground"
          )}
        >
          {label}
          <ArrowUpDown className={cn("h-3 w-3", active && sortDir === "desc" && "rotate-180")} />
        </button>
      </TableHead>
    );
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as "kanban" | "lista")}
    >
      <TabsList className="mb-4">
        <TabsTrigger value="kanban" className="cursor-pointer">Kanban</TabsTrigger>
        <TabsTrigger value="lista" className="cursor-pointer">Lista</TabsTrigger>
      </TabsList>

      <TabsContent value="kanban">
        <KanbanBoard
          initialColumns={columns}
          onMoveSuccess={onDealMoved}
          onAddDeal={onAddDeal}
          onDealClick={onDealClick}
        />
      </TabsContent>

      <TabsContent value="lista">
        {allDeals.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay deals aun.</p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Titulo" field="title" />
                  <SortableHead label="Contacto" field="contactName" />
                  <SortableHead label="Valor" field="value" />
                  <SortableHead label="Etapa" field="stageName" />
                  <SortableHead label="Probabilidad" field="probability" className="hidden md:table-cell" />
                  <SortableHead label="Cierre est." field="expectedClose" className="hidden lg:table-cell" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedDeals.map((deal) => (
                  <TableRow
                    key={deal.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/deals/${deal.id}`)}
                  >
                    <TableCell className="font-medium">{deal.title}</TableCell>
                    <TableCell>{deal.contactName || "-"}</TableCell>
                    <TableCell className="font-semibold text-primary">
                      {deal.valueType === "percentage"
                        ? `${deal.percentageValue ?? 0}% recaudación`
                        : formatCurrency(deal.value)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        style={{
                          borderColor: deal.stageColor || undefined,
                          color: deal.stageColor || undefined,
                        }}
                      >
                        {deal.stageName || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{deal.probability}%</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {formatDate(deal.expectedClose)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
