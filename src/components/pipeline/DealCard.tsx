"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useLocale } from "@/lib/locale-context";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Temperature } from "@/types";

interface DealCardProps {
  id: string;
  title: string;
  value: number;
  contactName: string | null;
  contactTemperature: string | null;
  probability: number;
  onClick?: () => void;
}

export function DealCard({
  id,
  title,
  value,
  contactName,
  contactTemperature,
  probability,
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
      className="p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
    >
      <div className="space-y-2">
        <p className="text-sm font-medium leading-tight">{title}</p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-primary">
            {formatCurrency(value)}
          </span>
          {contactTemperature && (
            <StatusBadge
              temperature={contactTemperature as Temperature}
              size="sm"
            />
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{contactName || "Sin contacto"}</span>
          <span>{probability}%</span>
        </div>
      </div>
    </Card>
  );
}
