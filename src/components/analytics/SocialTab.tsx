"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Plus, BarChart2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { SocialMetric } from "@/types/analytics";
import { MetaIntegrationCard } from "@/components/analytics/MetaIntegrationCard";
import { useProject } from "@/lib/project-context";

interface MetaIntegration {
  connected: boolean;
  accountName?: string;
  lastSyncAt?: string;
  tokenExpiresAt?: string;
}

const socialSchema = z.object({
  platform: z.enum(["instagram", "tiktok", "youtube"], {
    error: "Selecciona una plataforma",
  }),
  followers: z.string().min(1, "Ingresa la cantidad de seguidores"),
  recorded_at: z.string().min(1, "La fecha es requerida"),
});

type SocialFormData = z.infer<typeof socialSchema>;

interface SocialTabProps {
  metrics: SocialMetric[];
  onRefresh: () => void;
  integration: MetaIntegration;
}

function buildChartData(metrics: SocialMetric[]) {
  const byDate: Record<string, Record<string, number>> = {};
  const sorted = [...metrics].sort((a, b) =>
    a.recordedAt.localeCompare(b.recordedAt)
  );
  for (const m of sorted) {
    if (!byDate[m.recordedAt]) byDate[m.recordedAt] = {};
    byDate[m.recordedAt][m.platform] = m.followers;
  }
  return Object.entries(byDate).map(([date, platforms]) => ({
    date,
    label: format(new Date(date), "d MMM", { locale: es }),
    ...platforms,
  }));
}

export function SocialTab({ metrics, onRefresh, integration }: SocialTabProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [platform, setPlatform] = useState<"instagram" | "tiktok" | "youtube" | "">("");
  const { activeProject } = useProject();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<SocialFormData>({ resolver: zodResolver(socialSchema) });

  const onSubmit = async (data: SocialFormData) => {
    setSubmitting(true);
    try {
      if (!activeProject?.id) {
        toast.error("Selecciona un proyecto antes de registrar");
        return;
      }
      const body = {
        projectId: activeProject.id,
        platform: data.platform,
        followers: parseInt(data.followers, 10),
        recordedAt: data.recorded_at,
      };
      const res = await fetch("/api/analytics/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error("Error al registrar snapshot");
        return;
      }
      toast.success("Snapshot registrado");
      reset();
      setPlatform("");
      setSheetOpen(false);
      onRefresh();
    } finally {
      setSubmitting(false);
    }
  };

  const chartData = buildChartData(metrics);
  const hasInstagram = metrics.some((m) => m.platform === "instagram");
  const hasTiktok = metrics.some((m) => m.platform === "tiktok");
  const hasYoutube = metrics.some((m) => m.platform === "youtube");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {metrics.length} registro{metrics.length !== 1 ? "s" : ""} de redes sociales
        </p>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Registrar snapshot
        </Button>
      </div>

      <MetaIntegrationCard integration={integration} onRefresh={onRefresh} projectId={activeProject?.id} />

      {chartData.length > 0 ? (
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground mb-4">Seguidores por plataforma</p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => new Intl.NumberFormat("es-CL").format(v)}
                width={70}
              />
              <Tooltip
                formatter={(v, name) => [
                  new Intl.NumberFormat("es-CL").format(Number(v ?? 0)),
                  String(name),
                ]}
              />
              <Legend />
              {hasInstagram && (
                <Line
                  type="monotone"
                  dataKey="instagram"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Instagram"
                />
              )}
              {hasTiktok && (
                <Line
                  type="monotone"
                  dataKey="tiktok"
                  stroke="#ec4899"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="TikTok"
                />
              )}
              {hasYoutube && (
                <Line
                  type="monotone"
                  dataKey="youtube"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="YouTube"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Sin datos de redes sociales</p>
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Registrar snapshot de redes</SheetTitle>
          </SheetHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 px-4 py-2 overflow-y-auto flex-1">
            <div className="space-y-1.5">
              <Label>Plataforma *</Label>
              <Select
                value={platform}
                onValueChange={(v) => {
                  const val = v as "instagram" | "tiktok" | "youtube";
                  setPlatform(val);
                  setValue("platform", val);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona plataforma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="tiktok">TikTok</SelectItem>
                  <SelectItem value="youtube">YouTube</SelectItem>
                </SelectContent>
              </Select>
              {errors.platform && (
                <p className="text-xs text-destructive">{errors.platform.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="followers">Seguidores *</Label>
              <Input
                id="followers"
                type="number"
                min="0"
                placeholder="10000"
                {...register("followers")}
              />
              {errors.followers && (
                <p className="text-xs text-destructive">{errors.followers.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recorded_at">Fecha del registro *</Label>
              <Input id="recorded_at" type="date" {...register("recorded_at")} />
              {errors.recorded_at && (
                <p className="text-xs text-destructive">{errors.recorded_at.message}</p>
              )}
            </div>
            <SheetFooter>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Guardar snapshot
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
