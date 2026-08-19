import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { sendPushToUsers } from "@/lib/push";

interface SignerProfile {
  userId: string;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
}

function siteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

// Los firmantes requeridos son "los project_members del proyecto del
// evento con rol Admin o Artista" (decisión explícita de Francisco, 19 ago
// 2026 -- Miembro y Staff técnico no firman) -- no se guardan aparte, se
// calculan en caliente cada vez.
//
// Dos queries en vez de un embed (`profiles ( ... )`) a propósito:
// `project_members.user_id` NO tiene foreign key hacia `profiles` (a
// diferencia de `organization_members`/`event_closing_signatures`, que sí
// la tienen) -- PostgREST no puede resolver el embed sin esa FK, así que
// fallaba en silencio (`data` quedaba `null`, `data ?? []` lo escondía) y
// siempre devolvía 0 firmantes requeridos. Bug encontrado el 19 ago 2026:
// Francisco cerró la caja de un evento real y le apareció "0/0" +
// "no eres parte del equipo requerido" a pesar de estar en el proyecto.
async function getRequiredSigners(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string
): Promise<SignerProfile[]> {
  const { data: members } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .in("role", ["admin", "artist"]);

  const userIds: string[] = (members ?? []).map((m: { user_id: string }) => m.user_id);
  if (userIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .in("id", userIds);

  const profileById = new Map(
    (profiles ?? []).map((p: { id: string; full_name: string | null; email: string | null; avatar_url: string | null }) => [p.id, p])
  );

  return userIds.map((userId) => {
    const p = profileById.get(userId) as { full_name: string | null; email: string | null; avatar_url: string | null } | undefined;
    return {
      userId,
      fullName: p?.full_name ?? null,
      email: p?.email ?? null,
      avatarUrl: p?.avatar_url ?? null,
    };
  });
}

// GET /api/eventos/[id]/signatures -- estado de la firma virtual del cierre
// de caja: quiénes deben firmar (project_members del proyecto del evento),
// quiénes ya firmaron y cuándo, y si el usuario actual puede firmar.
// Acceso restringido a project_members de ESE proyecto (o admin) -- a
// diferencia de GET /api/eventos/[id], que hoy no filtra por proyecto.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, isAdmin, allowedProjectIds, error } = await requireAuth();
  if (error) return error;

  const { data: show, error: showErr } = await supabase
    .from("shows")
    .select("id, name, project_id, cost_sheet_closed_at")
    .eq("id", id)
    .single();

  if (showErr || !show) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }
  if (!show.project_id) {
    return NextResponse.json({ error: "El evento no tiene proyecto asignado" }, { status: 400 });
  }
  if (!isAdmin && (!allowedProjectIds || !allowedProjectIds.includes(show.project_id))) {
    return NextResponse.json({ error: "Sin acceso a este evento" }, { status: 403 });
  }

  const requiredSigners = await getRequiredSigners(supabase, show.project_id);

  const { data: sigRows } = await supabase
    .from("event_closing_signatures")
    .select("user_id, signed_at, profiles ( full_name, email, avatar_url )")
    .eq("show_id", id)
    .order("signed_at", { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signatures = (sigRows ?? []).map((s: any) => ({
    userId: s.user_id,
    signedAt: s.signed_at,
    fullName: s.profiles?.full_name ?? null,
    email: s.profiles?.email ?? null,
    avatarUrl: s.profiles?.avatar_url ?? null,
  }));

  const signedIds = new Set(signatures.map((s: { userId: string }) => s.userId));
  const allSigned = requiredSigners.length > 0 && requiredSigners.every((r) => signedIds.has(r.userId));
  const isRequiredSigner = requiredSigners.some((r) => r.userId === user!.id);
  const alreadySigned = signedIds.has(user!.id);

  return NextResponse.json({
    eventName: show.name,
    costSheetClosed: Boolean(show.cost_sheet_closed_at),
    requiredSigners,
    signatures,
    allSigned,
    alreadySigned,
    // Un admin de la organización siempre puede firmar aunque su rol en
    // ESTE proyecto no sea Admin/Artista (ej. Francisco, dueño de la org,
    // asignado como "Miembro" en Gamuza) -- pero no se le exige, no cuenta
    // como uno de los requeridos.
    canSign: Boolean(show.cost_sheet_closed_at) && (isRequiredSigner || isAdmin) && !alreadySigned,
  });
}

// POST /api/eventos/[id]/signatures -- registra la aprobación del usuario
// actual. Irreversible (sin endpoint de "des-firmar") -- la única forma de
// sacar una firma es reabrir la caja, que las borra todas (ver
// costs/reopen/route.ts).
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user, allowedProjectIds, isAdmin, error } = await requireAuth();
  if (error) return error;

  const { data: show, error: showErr } = await supabase
    .from("shows")
    .select("id, name, project_id, cost_sheet_closed_at")
    .eq("id", id)
    .single();

  if (showErr || !show) {
    return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
  }
  if (!show.cost_sheet_closed_at) {
    return NextResponse.json({ error: "La caja todavía no está cerrada -- no hay nada que firmar" }, { status: 400 });
  }
  if (!show.project_id) {
    return NextResponse.json({ error: "El evento no tiene proyecto asignado" }, { status: 400 });
  }
  if (!isAdmin && (!allowedProjectIds || !allowedProjectIds.includes(show.project_id))) {
    return NextResponse.json({ error: "Sin acceso a este evento" }, { status: 403 });
  }

  const requiredSigners = await getRequiredSigners(supabase, show.project_id);
  const isRequiredSigner = requiredSigners.some((r) => r.userId === user!.id);
  if (!isRequiredSigner && !isAdmin) {
    return NextResponse.json(
      { error: "Solo Admin/Artista del proyecto de este evento pueden firmar el cierre" },
      { status: 403 }
    );
  }

  const { error: insertError } = await supabase
    .from("event_closing_signatures")
    .insert({ show_id: id, user_id: user!.id });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "Ya habías firmado este cierre" }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Fire-and-forget: avisar al resto del proyecto. Si esta firma completó
  // a todos los requeridos, un mensaje distinto (más de cierre).
  const { data: sigRows } = await supabase
    .from("event_closing_signatures")
    .select("user_id")
    .eq("show_id", id);
  const signedIds = new Set((sigRows ?? []).map((s: { user_id: string }) => s.user_id));
  const allSigned = requiredSigners.every((r) => signedIds.has(r.userId));
  const othersToNotify = requiredSigners.map((r) => r.userId).filter((uid) => uid !== user!.id);

  if (othersToNotify.length > 0) {
    void sendPushToUsers(othersToNotify, {
      title: allSigned ? "Cierre de caja aprobado por todos" : "Firmó el cierre de caja",
      body: allSigned
        ? `Ya todos aprobaron el cierre de ${show.name}`
        : `Falta que confirmes el cierre de ${show.name}`,
      url: siteUrl(`/eventos/${id}/firmar`),
    });
  }

  return NextResponse.json({ ok: true, allSigned }, { status: 201 });
}
