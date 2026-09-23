import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { canEditDeals, getProjectPermissions } from "@/lib/project-roles";
import { LEAD_FORMS, type LeadFormConfig } from "@/lib/leads/forms";
import { leadIngestSchema } from "@/lib/leads/schema";
import { ingestLead } from "@/lib/leads/ingest";
import { notifyNewLead } from "@/lib/leads/notify";

// POST /api/leads/quick -- "Lead rapido": el equipo carga en ~20 s un lead
// que llego por WhatsApp o DM. Reutiliza la misma logica que el formulario
// publico (dedupe de contacto, sin tratos duplicados, lead_meta), pero con
// sesion y permisos de edicion de deals sobre el proyecto. No manda nada a
// la Conversions API: no hubo visita web que atribuir.

const CHANNEL_TO_CONTACT_SOURCE: Record<string, string> = {
  whatsapp: "whatsapp",
  instagram: "redes_sociales",
  tiktok: "redes_sociales",
  referido: "referido",
  evento: "evento",
  otro: "otro",
};

const quickSchema = z.object({
  projectId: z.string().uuid(),
  channel: z.enum(["whatsapp", "instagram", "tiktok", "referido", "evento", "otro"]),
});

export async function POST(request: NextRequest) {
  const { supabase, user, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const body = await request.json().catch(() => null);
  const meta = quickSchema.safeParse(body);
  if (!meta.success) return NextResponse.json({ error: "Proyecto o canal invalido" }, { status: 400 });
  const { projectId, channel } = meta.data;

  if (!allowedProjectIds?.includes(projectId)) {
    return NextResponse.json({ error: "Sin acceso al proyecto" }, { status: 403 });
  }
  const perm = await getProjectPermissions(supabase, user!.id, projectId);
  if (!canEditDeals(perm)) return NextResponse.json({ error: "Sin permiso para crear deals" }, { status: 403 });

  const parsed = leadIngestSchema.safeParse({ ...body, form: "quick", heard_from: channel });
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  // Si el proyecto tiene un formulario publico, se usa su producto y precio
  // (ej. SiSoy -> Podcast Live, Precio Fundador); si no, el trato parte en $0.
  const db = createAdminClient();
  let form: LeadFormConfig | undefined = Object.values(LEAD_FORMS).find((f) => f.projectId === projectId);
  if (!form) {
    const { data: project } = await db.from("projects").select("name").eq("id", projectId).single();
    form = { projectId, allowedOrigins: [], productName: project?.name ?? "Lead", dealValueCents: 0, metaValue: 0 };
  }

  try {
    const result = await ingestLead(db, "quick", form, parsed.data, {
      createdBy: user!.id,
      contactSource: CHANNEL_TO_CONTACT_SOURCE[channel],
    });
    // Aviso al equipo en segundo plano si el formulario del proyecto tiene `notify`.
    const leadForm = form;
    if (leadForm.notify && result.status !== "duplicate_event") {
      after(() =>
        notifyNewLead({ formKey: "quick", form: leadForm, input: parsed.data, result }).catch((err) =>
          console.error("[leads/notify]", err)
        )
      );
    }
    return NextResponse.json({ ok: true, ...result }, { status: result.status === "created" ? 201 : 200 });
  } catch (err) {
    console.error("[leads/quick]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "No se pudo crear el lead" }, { status: 500 });
  }
}
