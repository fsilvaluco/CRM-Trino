"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Check, Mail, Star, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type TestimonialStatus = "pending_code" | "verified" | "approved" | "rejected";

export interface TestimonialItem {
  id: string;
  name: string;
  /** Solo viene para admins del proyecto. */
  email: string | null;
  rating: number;
  body: string;
  relation: string | null;
  status: TestimonialStatus;
  createdAt: string;
  verifiedAt: string | null;
  approvedAt: string | null;
}

const STATUS_BADGE: Record<TestimonialStatus, { label: string; className: string }> = {
  pending_code: { label: "Sin confirmar", className: "bg-muted text-muted-foreground" },
  verified: { label: "Pendiente", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  approved: { label: "Aprobado", className: "bg-green-600/15 text-green-700 dark:text-green-400" },
  rejected: { label: "Rechazado", className: "bg-red-600/15 text-red-700 dark:text-red-400" },
};

function Stars({ rating }: { rating: number }) {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <div className="flex items-center gap-0.5" aria-label={`${r} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn("h-4 w-4", i <= r ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")}
        />
      ))}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: es });
}

interface Props {
  item: TestimonialItem;
  canModerate: boolean;
  busy: boolean;
  onModerate: (item: TestimonialItem, action: "approve" | "reject") => void;
}

export function TestimonialCard({ item, canModerate, busy, onModerate }: Props) {
  const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.verified;
  const moderable = item.status !== "pending_code";

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="font-medium truncate">
              {item.name}
              {item.relation && <span className="text-muted-foreground font-normal"> · {item.relation}</span>}
            </p>
            <Stars rating={item.rating} />
          </div>
          <Badge variant="secondary" className={cn("shrink-0 text-xs", badge.className)}>
            {badge.label}
          </Badge>
        </div>

        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{item.body}</p>

        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Recibido el {formatDate(item.createdAt)}</p>
          {item.status === "approved" && item.approvedAt && <p>Aprobado el {formatDate(item.approvedAt)}</p>}
          {item.email && (
            <p className="flex items-center gap-1 truncate">
              <Mail className="h-3 w-3 shrink-0" />
              <a href={`mailto:${item.email}`} className="hover:underline truncate">{item.email}</a>
            </p>
          )}
        </div>

        {canModerate && moderable && (
          <div className="flex items-center gap-2 pt-1 border-t">
            {item.status !== "approved" && (
              <Button
                size="sm"
                className="h-8 mt-2 cursor-pointer bg-green-700 hover:bg-green-800 text-white"
                disabled={busy}
                onClick={() => onModerate(item, "approve")}
              >
                <Check className="h-4 w-4 mr-1" />
                Aprobar
              </Button>
            )}
            {item.status !== "rejected" && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 mt-2 cursor-pointer text-red-700 hover:text-red-800 dark:text-red-400"
                disabled={busy}
                onClick={() => onModerate(item, "reject")}
              >
                <X className="h-4 w-4 mr-1" />
                Rechazar
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
