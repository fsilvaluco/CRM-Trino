"use client";

import { useState, useEffect, useCallback } from "react";
import { Newspaper, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnalyticsPageHeader } from "@/components/analytics/AnalyticsPageHeader";
import { PressStatsCards } from "@/components/analytics/PressStatsCards";
import { PressMonthlyChart } from "@/components/analytics/PressMonthlyChart";
import { PressMentionsTable } from "@/components/analytics/PressMentionsTable";
import { PressMentionSheet } from "@/components/analytics/PressMentionSheet";
import { useProject } from "@/lib/project-context";
import type { PressMention } from "@/types/press";

export default function AnalyticsPressPage() {
  const { activeProject, isAllProjects } = useProject();
  const [mentions, setMentions] = useState<PressMention[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingMention, setEditingMention] = useState<PressMention | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (isAllProjects) {
        params.set("isAllProjects", "true");
      } else if (activeProject?.id) {
        params.set("projectId", activeProject.id);
      }
      const res = await fetch(`/api/analytics/press?${params.toString()}`);
      const data = await res.json();
      setMentions(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [activeProject?.id, isAllProjects]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditingMention(null);
    setSheetOpen(true);
  };

  const openEdit = (mention: PressMention) => {
    setEditingMention(mention);
    setSheetOpen(true);
  };

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader icon={Newspaper} title="Prensa" description="Cobertura mediática y menciones" />

      {loading ? (
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      ) : (
        <>
          <PressStatsCards mentions={mentions} />
          <PressMonthlyChart mentions={mentions} />

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Menciones</p>
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Agregar mención
            </Button>
          </div>
          <PressMentionsTable mentions={mentions} onEdit={openEdit} onDeleted={load} />

          <PressMentionSheet open={sheetOpen} onOpenChange={setSheetOpen} onSaved={load} editingMention={editingMention} />
        </>
      )}
    </div>
  );
}
