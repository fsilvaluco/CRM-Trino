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
import { EventSetupDialog } from "@/components/events/EventSetupDialog";
import { toast } from "sonner";
import type { PipelineColumn } from "@/types";
import { useKanbanDnd } from "@/lib/hooks/use-kanban-dnd";
import { useProject } from "@/lib/project-context";

interface KanbanBoardProps {
  initialColumns: PipelineColumn[];
  onMoveSuccess?: () => void;
  onAddDeal?: (stageId: string) => void;
  onDealClick?: (dealId: string) => void;
}

export function KanbanBoard({ initialColumns, onMoveSuccess, onAddDeal, onDealClick }: KanbanBoardProps) {
  const { isAllProjects } = useProject();
  const [columns, setColumns] = useState(initialColumns);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [closeDialog, setCloseDialog] = useState<{
    dealId: string;
    dealTitle: string;
    currentValue: number | null;
    outcome: "won" | "lost";
  } | null>(null);
  const [showSetup, setShowSetup] = useState<{ dealId: string; dealTitle: string; projectId: string } | null>(null);
  const pendingShowRef = useRef<{ dealId: string; dealTitle: string; projectId: string } | null>(null);
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

  const findColumnOf = (cols: PipelineColumn[], id: string) =>
    cols.find((col) => col.id === id) || cols.find((col) => col.deals.some((d) => d.id === id));

  const { sensors, collisionDetectionStrategy, accessibility } = useKanbanDnd({
    columnIds: columns.map((c) => c.id),
    getItemLabel: (id) =>
      columns.flatMap((c) => c.deals).find((d) => d.id === id)?.title ?? "deal",
    getColumnLabel: (id) => findColumnOf(columns, String(id))?.name ?? null,
  });

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

  // Guarda el cambio de etapa en el servidor. `snapshot` es el estado previo
  // al movimiento (para revertir si falla y para leer los datos del deal).
  const persistMove = useCallback(
    async (dealId: string, targetColumn: PipelineColumn, snapshot: PipelineColumn[]) => {
      // Regla del rediseño de roles (ROLES.md 0.5): en "Todos los
      // proyectos" no se edita nada -- el servidor ya lo rechazaría, pero
      // evitamos el viaje de red y damos un mensaje específico en vez del
      // genérico "Error al mover el deal".
      if (isAllProjects) {
        setColumns(snapshot);
        toast.warning("Selecciona un proyecto para mover deals de etapa");
        return;
      }

      try {
        const res = await fetch("/api/pipeline", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dealId, stageId: targetColumn.id }),
        });
        if (!res.ok) {
          throw new Error("API error");
        }
        onMoveSuccess?.();

        // Si la etapa destino es Ganado o Perdido, pedir el motivo/valor
        // real de cierre -- se usa el snapshot previo para encontrar el
        // deal, porque el estado ya se actualizo de forma optimista.
        if (targetColumn.isWon || targetColumn.isLost) {
          const movedDeal = snapshot.flatMap((col) => col.deals).find((d) => d.id === dealId);
          if (movedDeal) {
            if (targetColumn.isWon && movedDeal.isShow) {
              pendingShowRef.current = {
                dealId,
                dealTitle: movedDeal.title,
                projectId: movedDeal.artistProjectId || movedDeal.projectId || "",
              };
            }
            setCloseDialog({
              dealId,
              dealTitle: movedDeal.title,
              currentValue: movedDeal.value,
              outcome: targetColumn.isWon ? "won" : "lost",
            });
          }
        }
      } catch {
        setColumns(snapshot);
        toast.error("Error al mover el deal. Se revirtió el cambio.");
      }
    },
    [onMoveSuccess, isAllProjects]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      const snapshot = columnsSnapshot.current;

      // Soltado fuera de las columnas: deshacer el movimiento visual que
      // haya hecho handleDragOver.
      if (!over) {
        setColumns(snapshot);
        return;
      }

      const dealId = active.id as string;
      const targetColumn = findColumnOf(columns, String(over.id));
      if (!targetColumn) {
        setColumns(snapshot);
        return;
      }

      // Misma etapa que antes de arrastrar (p. ej. reordenar dentro de
      // "Ganado"): no hay nada que guardar ni motivo de cierre que pedir.
      const originalColumn = snapshot.find((col) => col.deals.some((d) => d.id === dealId));
      if (originalColumn?.id === targetColumn.id) return;

      await persistMove(dealId, targetColumn, snapshot);
    },
    [columns, persistMove]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setColumns(columnsSnapshot.current);
  }, []);

  // Alternativa sin arrastre (menu "Mover a" de cada tarjeta).
  const handleMoveDeal = useCallback(
    (dealId: string, targetStageId: string) => {
      const snapshot = columns;
      const targetColumn = columns.find((c) => c.id === targetStageId);
      const deal = columns.flatMap((c) => c.deals).find((d) => d.id === dealId);
      if (!targetColumn || !deal || deal.stageId === targetStageId) return;
      setColumns((prev) =>
        prev.map((col) => {
          if (col.id === targetStageId) return { ...col, deals: [...col.deals, { ...deal, stageId: targetStageId }] };
          return { ...col, deals: col.deals.filter((d) => d.id !== dealId) };
        })
      );
      void persistMove(dealId, targetColumn, snapshot);
    },
    [columns, persistMove]
  );

  const stageTargets = columns.map((c) => ({ id: c.id, label: c.name, color: c.color }));

  return (
    <>
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionStrategy}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      accessibility={accessibility}
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
            stages={stageTargets}
            onMoveDeal={handleMoveDeal}
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
              lead: d.lead ?? null,
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
            lead={activeDeal.lead ?? null}
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
        onClose={() => {
          setCloseDialog(null);
          if (pendingShowRef.current) {
            setShowSetup(pendingShowRef.current);
            pendingShowRef.current = null;
          }
        }}
        dealId={closeDialog.dealId}
        dealTitle={closeDialog.dealTitle}
        currentValue={closeDialog.currentValue != null ? Math.round(closeDialog.currentValue / 100) : null}
        outcome={closeDialog.outcome}
        onSaved={onMoveSuccess}
      />
    )}

    {showSetup && (
      <EventSetupDialog
        open
        onClose={() => setShowSetup(null)}
        dealId={showSetup.dealId}
        dealTitle={showSetup.dealTitle}
        projectId={showSetup.projectId}
        onSaved={onMoveSuccess}
      />
    )}
    </>
  );
}
