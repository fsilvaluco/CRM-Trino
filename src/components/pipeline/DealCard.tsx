"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Card } from "@/components/ui/card";
import { useLocale } from "@/lib/locale-context";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ProjectTag } from "@/components/shared/ProjectTag";
import { AssigneeAvatarStack, type AssigneeRef } from "@/components/shared/AssigneeAvatarStack";
import { Clock } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface DealCardProps {
  id: string;
  title: string;
  value: number;
  valueType?: "fixed" | "percentage";
  percentageValue?: number | null;
  contactName: string | null;
  probability: number;
  expectedClose?: string | Date | null;
  hasUnseenActivity?: boolean;
  tagProjectName?: string | null;
  tagProjectColor?: string | null;
  tagProjectAvatarUrl?: string | null;
  assignees?: AssigneeRef[];
  onClick?: () => void;
}

export function DealCard({
  id,
  title,
  value,
  valueType = "fixed",
  percentageValue = null,
  contactName,
  probability,
  expectedClose,
  hasUnseenActivity,
  tagProjectName,
  tagProjectColor,
  tagProjectAvatarUrl,
  assignees,
  onClick,
}: DealCardProps) {
  const { formatCurrency } = useLocale();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerDownRef.current = { x: event.clientX, y: event.clientY };
    listeners?.onPointerDown?.(event);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onClick || isDragging) return;

    const startPoint = pointerDownRef.current;
    pointerDownRef.current = null;
    if (!startPoint) return;

    const distance = Math.hypot(event.clientX - startPoint.x, event.clientY - startPoint.y);
    if (distance <= 5) {
      onClick();
    }
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      className="relative p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
    >
      {hasUnseenActivity && (
        <span
          className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-card"
          title="Actividad nueva sin ver"
        />
      )}
      <div className="space-y-2">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-primary">
            {valueType === "percentage" ? `${percentageValue ?? 0}% recaudación` : formatCurrency(value)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{contactName || "Sin contacto"}</span>
          <span>{probability}%</span>
        </div>
        {expectedClose && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {format(new Date(expectedClose), "d MMM yyyy", { locale: es })}
          </div>
        )}
        {tagProjectName && (
          <ProjectTag name={tagProjectName} color={tagProjectColor} avatarUrl={tagProjectAvatarUrl} />
        )}
        {assignees && assignees.length > 0 && (
          <AssigneeAvatarStack assignees={assignees} />
        )}
      </div>
    </Card>
  );
}
