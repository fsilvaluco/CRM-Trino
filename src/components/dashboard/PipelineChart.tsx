"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/lib/locale-context";

interface StageData {
  name: string;
  count: number;
  value: number;
  color: string;
}

interface PipelineChartProps {
  data: StageData[];
}

export function PipelineChart({ data }: PipelineChartProps) {
  const { formatCurrency } = useLocale();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pipeline de Ventas</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No hay deals en el pipeline
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const stage = payload[0].payload as StageData;
                  return (
                    <div
                      className="rounded-lg border bg-card px-3 py-2 text-sm shadow-sm"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <p className="font-medium mb-1">{stage.name}</p>
                      <p className="text-muted-foreground">
                        {stage.count} deal{stage.count !== 1 ? "s" : ""}
                      </p>
                      <p className="text-muted-foreground">
                        {formatCurrency(stage.value)} en total
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
