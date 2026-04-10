import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { classifyLead, isAIEnabled } from "@/lib/claude";
import { calculateLeadScore, suggestTemperature } from "@/lib/scoring";

export async function POST(request: NextRequest) {
  const { supabase, error } = await requireAuth();
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }
  const { contactId } = body;

  if (!contactId) {
    return NextResponse.json({ error: "contactId es requerido" }, { status: 400 });
  }

  const { data: contact, error: contactErr } = await supabase
    .from("contacts").select("*").eq("id", contactId).is("deleted_at", null).single();

  if (contactErr || !contact) {
    return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
  }

  const { data: contactActivities } = await supabase
    .from("activities").select("*").eq("contact_id", contactId);
  const acts = contactActivities ?? [];

  if (isAIEnabled()) {
    try {
      const result = await classifyLead(
        { name: contact.name, company: contact.company || undefined, source: contact.source, notes: contact.notes || undefined },
        acts.map((a) => ({
          type: a.type as "call" | "email" | "meeting" | "note" | "follow_up",
          description: a.description,
          date: a.created_at ? new Date(a.created_at).toISOString() : "unknown",
        }))
      );

      await supabase.from("contacts").update({ temperature: result.temperature, score: result.score, updated_at: new Date().toISOString() }).eq("id", contactId);
      return NextResponse.json({ ...result, mode: "ai" });
    } catch {
      // AI failed — fall through to rule-based scoring below
    }
  }

  const lastActivity = acts.sort((a, b) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0];

  const daysSinceLastActivity = lastActivity
    ? Math.floor((Date.now() - new Date(lastActivity.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  const score = calculateLeadScore({
    temperature: contact.temperature as "cold" | "warm" | "hot",
    hasEmail: !!contact.email,
    hasPhone: !!contact.phone,
    hasCompany: !!contact.company,
    activityCount: acts.length,
    daysSinceLastActivity,
    hasDeals: false,
    dealValue: 0,
  });

  const temperature = suggestTemperature(score);
  await supabase.from("contacts").update({ temperature, score, updated_at: new Date().toISOString() }).eq("id", contactId);

  return NextResponse.json({
    temperature,
    score,
    nextAction: "Revisar manualmente y dar seguimiento",
    reasoning: "Clasificacion basada en reglas (sin API key)",
    mode: "rules",
  });
}
