import { requireAuth } from "@/lib/supabase-server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, DollarSign, Percent, FileText } from "lucide-react";
import { ACTIVITY_TYPE_CONFIG } from "@/lib/constants";
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

  const [{ data: contactData }, { data: stageData }, { data: rawActivities }] = await Promise.all([
    supabase.from("contacts").select("id, name").eq("id", deal.contact_id).single(),
    supabase.from("pipeline_stages").select("id, name, color").eq("id", deal.stage_id).single(),
    supabase
      .from("activities")
      .select("*")
      .eq("deal_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const dealActivities = rawActivities ?? [];

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
              Actividades ({dealActivities.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dealActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay actividades registradas para este deal
              </p>
            ) : (
              <div className="space-y-3">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {dealActivities.map((activity: any) => {
                  const config =
                    ACTIVITY_TYPE_CONFIG[
                      activity.type as keyof typeof ACTIVITY_TYPE_CONFIG
                    ];
                  return (
                    <div key={activity.id} className="flex gap-3 items-start">
                      <div className="rounded-full bg-muted p-2 shrink-0">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {config?.label || activity.type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeDateWith(activity.created_at, locale)}
                          </span>
                        </div>
                        <p className="text-sm mt-1">{activity.description}</p>
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
