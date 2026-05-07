import { requireAuth } from "@/lib/supabase-server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, DollarSign, Percent, CheckSquare, Clock } from "lucide-react";
import { getLocaleSettings } from "@/lib/locale-server";
import { formatCurrencyWith, formatDateWith, formatRelativeDateWith } from "@/lib/locale";

export const dynamic = "force-dynamic";

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = getLocaleSettings();
  const { supabase, user } = await requireAuth();
  if (!user) redirect("/login");

  const { data: deal } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!deal) notFound();

  const [{ data: contactData }, { data: stageData }, { data: dealTasks }] = await Promise.all([
    supabase.from("contacts").select("id, name").eq("id", deal.contact_id).single(),
    supabase.from("pipeline_stages").select("id, name, color").eq("id", deal.stage_id).single(),
    supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, created_at")
      .eq("deal_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const tasks = dealTasks ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/deals">
          <Button variant="ghost" size="icon" className="cursor-pointer">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{deal.title}</h1>
            {stageData && (
              <Badge
                variant="outline"
                style={{ borderColor: stageData.color, color: stageData.color }}
              >
                {stageData.name}
              </Badge>
            )}
          </div>
          {contactData && (
            <Link
              href={`/contacts/${contactData.id}`}
              className="text-muted-foreground hover:text-primary text-sm"
            >
              {contactData.name}
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Valor
            </div>
            <p className="text-xl font-bold text-primary">
              {formatCurrencyWith(deal.value, locale)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Percent className="h-4 w-4" />
              Probabilidad
            </div>
            <p className="text-xl font-bold">{deal.probability}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              Cierre estimado
            </div>
            <p className="text-xl font-bold">
              {formatDateWith(deal.expected_close, locale)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              Valor ponderado
            </div>
            <p className="text-xl font-bold">
              {formatCurrencyWith(Math.round(deal.value * (deal.probability / 100)), locale)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {deal.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{deal.notes}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Tareas ({tasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay tareas asociadas a este deal
              </p>
            ) : (
              <div className="space-y-3">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {tasks.map((task: any) => {
                  const statusConfig = {
                    pending: { label: "Pendiente", color: "bg-gray-500" },
                    in_progress: { label: "En Progreso", color: "bg-blue-500" },
                    done: { label: "Completada", color: "bg-green-500" },
                  };
                  const priorityConfig = {
                    low: { label: "Baja", color: "text-gray-600" },
                    medium: { label: "Media", color: "text-yellow-600" },
                    high: { label: "Alta", color: "text-red-600" },
                  };
                  const status = statusConfig[task.status as keyof typeof statusConfig];
                  const priority = priorityConfig[task.priority as keyof typeof priorityConfig];
                  
                  return (
                    <div key={task.id} className="flex gap-3 items-start">
                      <div className={`rounded-full ${status.color} p-2 shrink-0`}>
                        <CheckSquare className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Link 
                            href={`/tasks?taskId=${task.id}`}
                            className="text-sm font-medium hover:text-primary"
                          >
                            {task.title}
                          </Link>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {status.label}
                          </Badge>
                          <span className={`text-xs ${priority.color}`}>
                            {priority.label}
                          </span>
                          {task.due_date && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {formatDateWith(task.due_date, locale)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
