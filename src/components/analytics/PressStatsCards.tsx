"use client";

import { useMemo } from "react";
import { Newspaper, TrendingUp, Building2, CalendarDays } from "lucide-react";
import type { PressMention } from "@/types/press";

const NUM = new Intl.NumberFormat("es-CL");

interface PressStatsCardsProps {
  mentions: PressMention[];
}

export function PressStatsCards({ mentions }: PressStatsCardsProps) {
  const stats = useMemo(() => {
    const earned = mentions.filter((m) => m.source === "earned").length;
    const distinctOutlets = new Set(mentions.map((m) => m.outlet.trim().toLowerCase())).size;
    const currentYear = new Date().getFullYear();
    const thisYear = mentions.filter((m) => m.mentionDate && new Date(`${m.mentionDate}T00:00:00`).getFullYear() === currentYear).length;

    return { total: mentions.length, earned, distinctOutlets, thisYear };
  }, [mentions]);

  const cards = [
    { label: "Menciones totales", value: stats.total, icon: Newspaper },
    { label: "Prensa ganada", value: stats.earned, icon: TrendingUp },
    { label: "Medios distintos", value: stats.distinctOutlets, icon: Building2 },
    { label: `Este año (${new Date().getFullYear()})`, value: stats.thisYear, icon: CalendarDays },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <c.icon className="h-3 w-3" /> {c.label}
          </p>
          <p className="text-lg font-bold">{NUM.format(c.value)}</p>
        </div>
      ))}
    </div>
  );
}
