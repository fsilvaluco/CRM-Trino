import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getLocaleSettings } from "@/lib/locale-server";
import { formatCurrencyWith } from "@/lib/locale";

export async function POST() {
  const { supabase, error } = await requireAuth();
  if (error) return error;

  const apiKey = process.env.RESEND_API_KEY;
  const email = process.env.DIGEST_EMAIL;

  if (!apiKey || !email) {
    return NextResponse.json(
      {
        error: "Email digest no configurado",
        instructions: [
          "1. Registrate en https://resend.com (gratis)",
          "2. Crea un API key en el dashboard",
          "3. Agrega a .env.local:",
          "   RESEND_API_KEY=re_...",
          "   DIGEST_EMAIL=tu@email.com",
          "4. Reinicia el servidor dev",
        ],
      },
      { status: 400 }
    );
  }

  // Gather data
  const [{ data: allContacts }, { data: allDeals }, { data: stages }, { data: pendingActivities }] = await Promise.all([
    supabase.from("contacts").select("name, company, temperature").is("deleted_at", null),
    supabase.from("deals").select("value, stage_id, deleted_at").is("deleted_at", null),
    supabase.from("pipeline_stages").select("id, name, is_won, is_lost").order("order", { ascending: true }),
    supabase.from("activities").select("id, type, description, scheduled_at, contacts ( name )").is("completed_at", null),
  ]);

  const now = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overdue = (pendingActivities ?? []).filter((a: any) => a.scheduled_at && new Date(a.scheduled_at).getTime() < now);
  const hotLeads = (allContacts ?? []).filter((c) => c.temperature === "hot");
  const stageMap = new Map((stages ?? []).map((s) => [s.id, s]));
  const activeDeals = (allDeals ?? []).filter((d) => {
    const stage = stageMap.get(d.stage_id);
    return stage && !stage.is_won && !stage.is_lost;
  });
  const pipelineValue = activeDeals.reduce((sum, d) => sum + d.value, 0);
  const locale = getLocaleSettings();

  // Build HTML email
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #1e293b; font-size: 24px; margin-bottom: 4px;">Auto-CRM</h1>
      <p style="color: #64748b; margin-top: 0;">Resumen diario — ${new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}</p>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />

      ${overdue.length > 0 ? `
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <h2 style="color: #dc2626; font-size: 16px; margin: 0 0 8px;">Seguimientos vencidos (${overdue.length})</h2>
          <ul style="margin: 0; padding-left: 20px; color: #991b1b;">
            ${overdue.map((a) => `<li>${a.description} — ${(a.contacts as {name?:string}|null)?.name || "Sin contacto"}</li>`).join("")}
          </ul>
        </div>
      ` : ""}

      <div style="display: flex; gap: 12px; margin-bottom: 16px;">
        <div style="flex: 1; background: #f1f5f9; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 24px; font-weight: bold; color: #1e293b;">${(allContacts ?? []).length}</div>
          <div style="font-size: 12px; color: #64748b;">Contactos</div>
        </div>
        <div style="flex: 1; background: #f1f5f9; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 24px; font-weight: bold; color: #1e293b;">${activeDeals.length}</div>
          <div style="font-size: 12px; color: #64748b;">Deals activos</div>
        </div>
        <div style="flex: 1; background: #f1f5f9; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 24px; font-weight: bold; color: #2563eb;">${formatCurrencyWith(pipelineValue, locale)}</div>
          <div style="font-size: 12px; color: #64748b;">En pipeline</div>
        </div>
      </div>

      ${hotLeads.length > 0 ? `
        <h3 style="color: #1e293b; font-size: 14px;">Leads calientes (${hotLeads.length})</h3>
        <ul style="color: #334155; font-size: 14px; padding-left: 20px;">
          ${hotLeads.map((c) => `<li>${c.name}${c.company ? ` — ${c.company}` : ""}</li>`).join("")}
        </ul>
      ` : ""}

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="color: #94a3b8; font-size: 12px; text-align: center;">
        Auto-CRM — Tu CRM local con IA
      </p>
    </div>
  `;

  // Send via Resend
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: process.env.DIGEST_FROM || "Auto-CRM <onboarding@resend.dev>",
        to: [email],
        subject: `CRM Digest: ${overdue.length > 0 ? `${overdue.length} vencidos` : `${activeDeals.length} deals activos`}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: `Error de Resend: ${err}` },
        { status: 500 }
      );
    }

    const result = await res.json();
    return NextResponse.json({
      success: true,
      emailId: result.id,
      sentTo: email,
      summary: {
        overdue: overdue.length,
        hotLeads: hotLeads.length,
        activeDeals: activeDeals.length,
        pipelineValue,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Error enviando email: ${error instanceof Error ? error.message : "Unknown"}` },
      { status: 500 }
    );
  }
}
