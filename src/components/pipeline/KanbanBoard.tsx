"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "./KanbanColumn";
import { DealCard } from "./DealCard";
import { DealCloseReasonDialog } from "@/components/deals/DealCloseReasonDialog";
import { toast } from "sonner";
import type { PipelineColumn } from "@/types";
import { useKanbanDnd } from "@/lib/hooks/use-kanban-dnd";

interface KanbanBoardProps {
  initialColumns: PipelineColumn[];
  onMoveSuccess?: () => void;
  onAddDeal?: (stageId: string) => void;
  onDealClick?: (dealId: string) => void;
}

export function KanbanBoard({ initialColumns, onMoveSuccess, onAddDeal, onDealClick }: KanbanBoardProps) {
  const [columns, setColumns] = useState(initialColumns);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [closeDialog, setCloseDialog] = useState<{
    dealId: string;
    dealTitle: string;
    currentValue: number | null;
    outcome: "won" | "lost";
  } | null>(null);
  const columnsSnapshot = useRef<PipelineColumn[]>(initialColumns);

  // El estado local (columns) existe para el drag-and-drop optimista --
  // mover una carta antes de que el backend confirme. Pero eso significaba
  // que, al cambiar de proyecto, el board nunca se enteraba de los datos
  // nuevos porque useState(initialColumns) solo lee el valor una vez, al
  // montar. Este efecto sincroniza el estado local cada vez que los datos
  // reales cambian (cambio de proyecto, o recarga tras mover un deal),
  // sin pisar un drag en progreso.
  useEffect(() => {
    setColumns(initialColumns);
    columnsSnapshot.current = initialColumns;
  }, [initialColumns]);

  const { sensors, collisionDetectionStrategy } = useKanbanDnd();

  const activeDeal = activeId
    ? columns
        .flatMap((col) => col.deals)
        .find((d) => d.id === activeId)
    : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    columnsSnapshot.current = columns;
  }, [columns]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find which columns the items are in
    const activeColumn = columns.find((col) =>
      col.deals.some((d) => d.id === activeId)
    );
    const overColumn =
      columns.find((col) => col.id === overId) ||
      columns.find((col) => col.deals.some((d) => d.id === overId));

    if (!activeColumn || !overColumn || activeColumn.id === overColumn.id)
      return;

    setColumns((prev) => {
      const activeDeal = activeColumn.deals.find((d) => d.id === activeId);
      if (!activeDeal) return prev;

      return prev.map((col) => {
        if (col.id === activeColumn.id) {
          return {
            ...col,
            deals: col.deals.filter((d) => d.id !== activeId),
          };
        }
        if (col.id === overColumn.id) {
          return {
            ...col,
            deals: [...col.deals, { ...activeDeal, stageId: col.id }],
          };
        }
        return col;
      });
    });
  }, [columns]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over) return;

      const activeId = active.id as string;
      const overColumn =
        columns.find((col) => col.id === over.id) ||
        columns.find((col) => col.deals.some((d) => d.id === over.id));

      if (!overColumn) return;

      // Update the deal's stage via API
      try {
        const res = await fetch("/api/pipeline", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dealId: activeId,
            stageId: overColumn.id,
          }),
        });
        if (!res.ok) {
          throw new Error("API error");
        }
        onMoveSuccess?.();

        // Si la etapa destino es Ganado o Perdido, pedir el motivo/valor
        // real de cierre -- se usa el snapshot pre-drag para encontrar el
        // deal, porque el estado ya se actualizo de forma optimista.
        if (overColumn.isWon || overColumn.isLost) {
          const movedDeal = columnsSnapshot.current
            .flatMap((col) => col.deals)
            .find((d) => d.id === activeId);
          if (movedDeal) {
            setCloseDialog({
              dealId: activeId,
              dealTitle: movedDeal.title,
              currentValue: movedDeal.value,
              outcome: overColumn.isWon ? "won" : "lost",
            });
          }
        }
      } catch {
        // Rollback to pre-drag state
        setColumns(columnsSnapshot.current);
        toast.error("Error al mover el deal. Se revirtio el cambio.");
      }
    },
    [columns, onMoveSuccess]
  );

  return (
    <>
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionStrategy}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((column) => (
          <KanbanColumn
            key={column.id}
            id={column.id}
            name={column.name}
            color={column.color}
            onAddDeal={onAddDeal ? () => onAddDeal(column.id) : undefined}
            onDealClick={onDealClick}
            deals={column.deals.map((d) => ({
              id: d.id,
              title: d.title,
              value: d.value,
              valueType: d.valueType,
              percentageValue: d.percentageValue,
              contactName: d.contactName || (d.contact?.name ?? null),
              probability: d.probability,
              expectedClose: d.expectedClose,
              hasUnseenActivity: d.hasUnseenActivity,
              tagProjectName: d.tagProjectName,
              tagProjectColor: d.tagProjectColor,
              tagProjectAvatarUrl: d.tagProjectAvatarUrl,
              assignees: d.assignees,
            }))}
          />
        ))}
      </div>

      <DragOverlay>
        {activeDeal ? (
          <DealCard
            id={activeDeal.id}
            title={activeDeal.title}
            value={activeDeal.value}
            valueType={activeDeal.valueType}
            percentageValue={activeDeal.percentageValue}
            contactName={
              activeDeal.contactName ||
              (activeDeal.contact?.name ?? null)
            }
            probability={activeDeal.probability}
            expectedClose={activeDeal.expectedClose}
            hasUnseenActivity={activeDeal.hasUnseenActivity}
            tagProjectName={activeDeal.tagProjectName}
            tagProjectColor={activeDeal.tagProjectColor}
            tagProjectAvatarUrl={activeDeal.tagProjectAvatarUrl}
            assignees={activeDeal.assignees}
          />
        ) : null}
      </DragOverlay>
    </DndContext>

    {closeDialog && (
      <DealCloseReasonDialog
        open
        onClose={() => setCloseDialog(null)}
        dealId={closeDialog.dealId}
        dealTitle={closeDialog.dealTitle}
        currentValue={closeDialog.currentValue != null ? Math.round(closeDialog.currentValue / 100) : null}
        outcome={closeDialog.outcome}
        onSaved={onMoveSuccess}
      />
    )}
    </>
  );
}
