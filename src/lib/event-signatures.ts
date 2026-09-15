// ─── Firma virtual del cierre de caja -- lógica compartida ──────────────────
// Extraído de signatures/route.ts (19 ago 2026) para poder reusarlo también
// desde costs/inform/route.ts sin duplicar las mismas dos queries.
//
// 15 sep 2026 (migración 101): a esa lista calculada ahora se le puede
// aplicar una selección a mano (`shows.required_signer_ids`). Sin selección
// firman todos los que califican, como siempre; con selección, solo esos.
// La selección es siempre un SUBCONJUNTO de los que califican -- nadie
// queda obligado a aprobar números que su matriz no lo deja ver.
//
// 25 ago 2026 (ROLES.md 0.2.4 / ítem 20 del rediseño de roles): los
// firmantes requeridos dejaron de calcularse por `role IN (admin, artist)`
// -- eso todavía asumía el modelo viejo de 4 roles fijos. Ahora exige
// `ve_ingresos && ve_costos` de Eventos en la matriz de cada persona --
// nadie firma una aprobación de números que no puede revisar, sin importar
// qué plantilla tenga.

import { getProjectPermissions } from "@/lib/project-roles";

export interface SignerProfile {
  userId: string;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface SignatureRecord extends SignerProfile {
  signedAt: string;
  ipAddress: string | null;
}

export interface SignaturesState {
  requiredSigners: SignerProfile[];
  /** Todos los que PODRÍAN firmar por permisos -- el universo entre el que
   * se elige con los checks. */
  eligibleSigners: SignerProfile[];
  signatures: SignatureRecord[];
  allSigned: boolean;
}

// Los firmantes requeridos son "los project_members del proyecto del
// evento que ven ingresos Y costos de Eventos en su matriz" -- no se
// guardan aparte, se calculan en caliente cada vez. Antes (hasta el 24 ago
// 2026) era "rol Admin o Artista" -- se migró a la matriz porque el rol ya
// no gobierna el permiso, es solo una plantilla de partida (ROLES.md 0.2).
//
// project_members.user_id NO tiene foreign key hacia `profiles` (a
// diferencia de `organization_members`/`event_closing_signatures`, que sí
// la tienen) -- PostgREST no puede resolver un embed sin esa FK, así que
// fallaba en silencio (`data` quedaba `null`, `data ?? []` lo escondía) y
// siempre devolvía 0 firmantes requeridos. Bug encontrado el 19 ago 2026 --
// se resuelve con una query aparte a `profiles`, no con un embed.
export async function getEligibleSigners(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string
): Promise<SignerProfile[]> {
  const { data: members } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId);

  const allMemberIds: string[] = (members ?? []).map((m: { user_id: string }) => m.user_id);
  if (allMemberIds.length === 0) return [];

  const signerFlags = await Promise.all(
    allMemberIds.map(async (uid) => {
      const perm = await getProjectPermissions(supabase, uid, projectId);
      const m = perm?.modules.eventos;
      return Boolean(m?.veIngresos && m?.veCostos);
    })
  );
  const userIds = allMemberIds.filter((_, i) => signerFlags[i]);
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

/** Los que efectivamente tienen que firmar: la selección a mano si existe
 * (migración 101), acotada a quienes califican por permisos; si no hay
 * selección, todos los que califican. Un id seleccionado que después pierde
 * el permiso se cae solo de la lista, a propósito -- si no puede ver los
 * números, no puede aprobarlos. */
export async function getRequiredSigners(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
  requiredSignerIds?: string[] | null
): Promise<SignerProfile[]> {
  const eligible = await getEligibleSigners(supabase, projectId);
  const chosen = requiredSignerIds ?? [];
  if (chosen.length === 0) return eligible;
  return eligible.filter((e) => chosen.includes(e.userId));
}

/** Firmantes requeridos + quiénes ya firmaron (incluye firmantes
 * "voluntarios" que firmaron sin ser requeridos) + si ya están todos. */
export async function getSignaturesState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  showId: string,
  projectId: string,
  requiredSignerIds?: string[] | null
): Promise<SignaturesState> {
  const eligibleSigners = await getEligibleSigners(supabase, projectId);
  const chosen = requiredSignerIds ?? [];
  const requiredSigners =
    chosen.length === 0 ? eligibleSigners : eligibleSigners.filter((e) => chosen.includes(e.userId));

  const { data: sigRows } = await supabase
    .from("event_closing_signatures")
    .select("user_id, signed_at, ip_address, profiles ( full_name, email, avatar_url )")
    .eq("show_id", showId)
    .order("signed_at", { ascending: true });

  const signatures: SignatureRecord[] = (sigRows ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: any) => ({
      userId: s.user_id,
      signedAt: s.signed_at,
      ipAddress: s.ip_address ?? null,
      fullName: s.profiles?.full_name ?? null,
      email: s.profiles?.email ?? null,
      avatarUrl: s.profiles?.avatar_url ?? null,
    })
  );

  const signedIds = new Set(signatures.map((s) => s.userId));
  const allSigned = requiredSigners.length > 0 && requiredSigners.every((r) => signedIds.has(r.userId));

  return { requiredSigners, eligibleSigners, signatures, allSigned };
}
