"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Download } from "lucide-react";
import { DealForm } from "@/components/deals/DealForm";
import { CrmTabs } from "@/components/crm/CrmTabs";
import type { PipelineColumn } from "@/types";
import { useProject } from "@/lib/project-context";

// Shape returned by /api/pipeline per stage
interface StageDeal {
  id: string;
  title: string;
  value: number;
  stageId: string;
  contactId: string;
  companyId: string | null;
  probability: number;
  expectedClose: number | null;
  createdAt: number;
  updatedAt: number;
  notes: string | null;
  contactName: string | null;
}

interface PipelineStageRaw {
  id: string;
  name: string;
  order: number;
  color: string;
  isWon: boolean;
  isLost: boolean;
  deals: StageDeal[];
}

// Shape expected by CrmTabs list view
interface DealListItem {
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

export default function CrmPageClient() {
  const [columns, setColumns] = useState<PipelineColumn[]>([]);
  const [dealList, setDealList] = useState<DealListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [addToStageId, setAddToStageId] = useState<string | undefined>();
  const [editingDealId, setEditingDealId] = useState<string | undefined>();
  const { activeProject } = useProject();

  const handleAddDeal = (stageId: string) => {
    setAddToStageId(stageId);
    setEditingDealId(undefined);
    setShowForm(true);
  };

  const handleEditDeal = (dealId: string) => {
    setEditingDealId(dealId);
    setAddToStageId(undefined);
    setShowForm(true);
  };

  const loadData = useCallback(() => {
    const params = activeProject ? `?projectId=${activeProject.id}` : "";
    fetch(`/api/pipeline${params}`)
      .then((r) => r.json())
      .then((pipeline: PipelineStageRaw[]) => {
        // Build Kanban columns
        const cols: PipelineColumn[] = pipeline.map((stage) => ({
          id: stage.id,
          name: stage.name,
          order: stage.order,
          color: stage.color,
          isWon: stage.isWon,
          isLost: stage.isLost,
          deals: stage.deals.map((d) => ({
            id: d.id,
            title: d.title,
            value: d.value,
            stageId: d.stageId,
            contactId: d.contactId,
            companyId: d.companyId ?? null,
            probability: d.probability,
            expectedClose: d.expectedClose ? new Date(d.expectedClose) : null,
            notes: d.notes ?? null,
            createdAt: d.createdAt ? new Date(d.createdAt) : new Date(),
            updatedAt: d.updatedAt ? new Date(d.updatedAt) : new Date(),
            contactName: d.contactName,
          })),
        }));
        setColumns(cols);

        // Build flat list for List tab
        const flat: DealListItem[] = pipeline.flatMap((stage) =>
          stage.deals.map((d) => ({
            id: d.id,
            title: d.title,
            value: d.value,
            probability: d.probability,
            contactName: d.contactName,
            stageName: stage.name,
            stageColor: stage.color,
            expectedClose: d.expectedClose,
            createdAt: d.createdAt,
          }))
        );
        setDealList(flat);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeProject]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">CRM</h1>
        <div className="flex gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-64 h-64 bg-muted rounded-lg animate-pulse shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  const totalDeals = dealList.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">CRM</h1>
          <p className="text-muted-foreground">
            {totalDeals} deal{totalDeals !== 1 ? "s" : ""} en el pipeline
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => window.open("/api/export?type=deals")}
            className="cursor-pointer"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button onClick={() => setShowForm(true)} className="cursor-pointer">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Deal
          </Button>
        </div>
      </div>

      <CrmTabs
        columns={columns}
        allDeals={dealList}
        onDealMoved={loadData}
        onAddDeal={handleAddDeal}
        onDealClick={handleEditDeal}
      />

      {showForm && (
        <DealForm
          open={showForm}
          initialStageId={addToStageId}
          initialDealId={editingDealId}
          onClose={() => {
            setShowForm(false);
            setAddToStageId(undefined);
            setEditingDealId(undefined);
            loadData();
          }}
        />
      )}
    </div>
  );
}
