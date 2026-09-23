"use client";

import { Card } from "@/components/ui/card";
import { useLocale } from "@/lib/locale-context";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ProjectTag } from "@/components/shared/ProjectTag";
import { AssigneeAvatarStack, type AssigneeRef } from "@/components/shared/AssigneeAvatarStack";
import { Clock, GripVertical, CalendarHeart, MapPin, Users, MessageCircleWarning } from "lucide-react";
import type { DealLeadInfo } from "@/types";
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
  lead?: DealLeadInfo | null;
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
  lead,
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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style} className="relative p-3 hover:shadow-md transition-shadow">
      {hasUnseenActivity && (
        <span
          className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-card"
          title="Actividad nueva sin ver"
        />
      )}

      {/* Handle de arrastre dedicado -- el resto de la tarjeta queda libre
          para hacer scroll horizontal del tablero sin ninguna ambigüedad
          (recomendación oficial de dnd-kit para tarjetas dentro de un
          contenedor con scroll). */}
      <button
        {...attributes}
        {...listeners}
        style={{ touchAction: "none" }}
        className="absolute top-2 right-2 p-1 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
        aria-label="Arrastrar para mover"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div onClick={onClick} className="space-y-2 cursor-pointer pr-5">
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
        {lead && <LeadInfo lead={lead} />}
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

const ORIGIN_LABEL: Record<string, string> = {
  ads: "Ads",
  organico: "Orgánico",
  web: "Web",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  tiktok: "TikTok",
  referido: "Referido",
  evento: "Evento",
  otro: "Otro",
};

// Datos del lead (fecha del evento, lugar, invitados) y alerta de horas sin
// contacto: ambar desde 24 h, rojo desde 72 h. Solo aparece en deals que
// vienen de un formulario o de "Lead rapido".
function LeadInfo({ lead }: { lead: DealLeadInfo }) {
  const place = [lead.venue, lead.comuna].filter(Boolean).join(" · ");
  const stale = lead.staleHours;
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {lead.eventDate && (
        <div className="flex items-center gap-1">
          <CalendarHeart className="h-3 w-3" />
          {format(new Date(`${lead.eventDate}T12:00:00`), "EEE d MMM yyyy", { locale: es })}
        </div>
      )}
      {place && (
        <div className="flex items-center gap-1">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{place}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        {lead.guests && (
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {lead.guests}
          </span>
        )}
        {lead.origin && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
            {ORIGIN_LABEL[lead.origin] ?? lead.origin}
          </span>
        )}
      </div>
      {stale !== null && stale >= 24 && (
        <div className={`flex items-center gap-1 font-medium ${stale >= 72 ? "text-red-600" : "text-amber-600"}`}>
          <MessageCircleWarning className="h-3 w-3" />
          {stale >= 48 ? `${Math.floor(stale / 24)} días sin contacto` : `${stale} h sin contacto`}
        </div>
      )}
    </div>
  );
}
