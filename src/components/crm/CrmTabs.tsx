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
import { KanbanBoard } from "@/components/pipeline/KanbanBoard";
import { useLocale } from "@/lib/locale-context";
import type { PipelineColumn } from "@/types";

interface DealRow {
  id: string;
  title: string;
  value: number;
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
}

export function CrmTabs({ columns, allDeals, onDealMoved, onAddDeal }: CrmTabsProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"kanban" | "lista">("kanban");
  const { formatCurrency, formatDate } = useLocale();

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
        <KanbanBoard initialColumns={columns} onMoveSuccess={onDealMoved} onAddDeal={onAddDeal} />
      </TabsContent>

      <TabsContent value="lista">
        {allDeals.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay deals aun.</p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titulo</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead className="hidden md:table-cell">Probabilidad</TableHead>
                  <TableHead className="hidden lg:table-cell">Cierre est.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allDeals.map((deal) => (
                  <TableRow
                    key={deal.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/deals/${deal.id}`)}
                  >
                    <TableCell className="font-medium">{deal.title}</TableCell>
                    <TableCell>{deal.contactName || "-"}</TableCell>
                    <TableCell className="font-semibold text-primary">
                      {formatCurrency(deal.value)}
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
