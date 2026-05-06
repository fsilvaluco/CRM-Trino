import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  let query = supabase
    .from("activities")
    .select("*, contacts ( name, company_id, companies ( name ) )")
    .is("completed_at", null)
    .order("scheduled_at", { ascending: true });

  if (projectId) query = query.eq("project_id", projectId);

  const { data, error: dbError } = await query;

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pending = (data ?? []).map((f: any) => ({
    id: f.id,
    type: f.type,
    description: f.description,
    contactId: f.contact_id,
    dealId: f.deal_id ?? null,
    scheduledAt: f.scheduled_at ?? null,
    completedAt: f.completed_at ?? null,
    createdAt: f.created_at,
    contactName: f.contacts?.name ?? null,
    contactCompany: f.contacts?.companies?.name ?? null,
  }));

  const categorized = {
    overdue: pending.filter((f) => {
      if (!f.scheduledAt) return false;
      return new Date(f.scheduledAt).getTime() < startOfToday.getTime();
    }),
    today: pending.filter((f) => {
      if (!f.scheduledAt) return false;
      const ts = new Date(f.scheduledAt).getTime();
      return ts >= startOfToday.getTime() && ts <= endOfToday.getTime();
    }),
    upcoming: pending.filter((f) => {
      if (!f.scheduledAt) return false;
      return new Date(f.scheduledAt).getTime() > endOfToday.getTime();
    }),
    unscheduled: pending.filter((f) => !f.scheduledAt),
  };

  return NextResponse.json(categorized);
}
