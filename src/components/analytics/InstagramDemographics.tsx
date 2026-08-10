"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useProject } from "@/lib/project-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface DemographicsData {
  gender: Array<{ label: string; value: number }>;
  age: Array<{ label: string; value: number }>;
  country: Array<{ label: string; value: number }>;
  city: Array<{ label: string; value: number }>;
  lastRecordedAt: string | null;
}

const GENDER_LABELS: Record<string, string> = { M: "Hombre", F: "Mujer", U: "Desconocido" };
const GENDER_COLORS = ["#6366f1", "#22c55e", "#f472b6"];

const NUM = new Intl.NumberFormat("es-CL");

function pct(value: number, total: number) {
  if (!total) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

export function InstagramDemographics() {
  const { activeProject } = useProject();
  const [data, setData] = useState<DemographicsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeProject) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/analytics/instagram/demographics?projectId=${activeProject.id}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [activeProject?.id]);

  if (loading) {
    return <div className="h-64 rounded-lg bg-muted animate-pulse" />;
  }

  const hasAnyData =
    data && (data.gender.length > 0 || data.age.length > 0 || data.country.length > 0 || data.city.length > 0);

  if (!hasAnyData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Demografía de seguidores</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Sin datos de demografía todavía — se llena con la próxima sincronización.
          </p>
        </CardContent>
      </Card>
    );
  }

  const genderTotal = data!.gender.reduce((s, g) => s + g.value, 0);
  const countryTotal = data!.country.reduce((s, c) => s + c.value, 0);

  return (
    <div className="space-y-2">
      {data!.lastRecordedAt && (
        <p className="text-xs text-muted-foreground text-right">
          Actualizado: {format(new Date(data!.lastRecordedAt), "d MMM HH:mm", { locale: es })}
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Género</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie
                data={data!.gender}
                dataKey="value"
                nameKey="label"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={2}
              >
                {data!.gender.map((_, i) => (
                  <Cell key={i} fill={GENDER_COLORS[i % GENDER_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }}
                labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                itemStyle={{ color: "#0f172a" }}
                formatter={(v) => NUM.format(Number(v))}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 text-sm">
            {data!.gender.map((g, i) => (
              <div key={g.label} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: GENDER_COLORS[i % GENDER_COLORS.length] }}
                />
                <span className="text-muted-foreground">{GENDER_LABELS[g.label] ?? g.label}</span>
                <span className="font-medium">{pct(g.value, genderTotal)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edad</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data!.age}>
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }}
                labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                itemStyle={{ color: "#0f172a" }}
                formatter={(v) => NUM.format(Number(v))}
              />
              <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seguidores por país</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data!.country.slice(0, 8).map((c) => (
              <div key={c.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{c.label}</span>
                <span className="font-medium">{pct(c.value, countryTotal)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seguidores por ciudad</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data!.city.slice(0, 8).map((c) => (
              <div key={c.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{c.label}</span>
                <span className="font-medium">{pct(c.value, countryTotal)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
