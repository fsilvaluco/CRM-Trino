"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic2, MapPin, ChevronRight } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { es } from "date-fns/locale";
import type { LiveShow, ShowStatus } from "@/types/shows";

const STATUS_CLASSNAMES: Record<ShowStatus, string> = {
  cotizando: "bg-yellow-100 text-yellow-700",
  confirmado: "bg-blue-100 text-blue-700",
  realizado: "bg-green-100 text-green-700",
  cancelado: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<ShowStatus, string> = {
  cotizando: "Cotizando",
  confirmado: "Confirmado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

const LOOKAHEAD_DAYS = 21;

function relativeDay(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(`${dateStr}T00:00:00`);
  const diff = differenceInCalendarDays(eventDate, today);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  return format(eventDate, "EEEE d MMM", { locale: es });
}

export function UpcomingEventsWidget() {
  const [events, setEvents] = useState<LiveShow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/eventos")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: LiveShow[]) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const limit = new Date(today);
        limit.setDate(limit.getDate() + LOOKAHEAD_DAYS);

        const upcoming = (Array.isArray(data) ? data : [])
          .filter((e) => (e.status === "confirmado" || e.status === "cotizando"))
          .filter((e) => {
            const d = new Date(`${e.date}T00:00:00`);
            return d >= today && d <= limit;
          })
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 5);

        setEvents(upcoming);
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <Mic2 className="h-4 w-4" />
          Próximos eventos
        </CardTitle>
        <Link href="/eventos" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
          Ver todos
          <ChevronRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-12 bg-muted rounded-md animate-pulse" />)}
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Sin eventos en los próximos {LOOKAHEAD_DAYS} días.
          </p>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <Link
                key={event.id}
                href="/eventos"
                className="block rounded-md border px-3 py-2 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{event.name}</p>
                  <Badge variant="secondary" className={`text-xs shrink-0 ${STATUS_CLASSNAMES[event.status]}`}>
                    {STATUS_LABELS[event.status]}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span className="capitalize">{relativeDay(event.date)}</span>
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {event.venue}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
