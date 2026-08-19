// ─── Firma virtual del cierre de caja -- lógica compartida ──────────────────
// Extraído de signatures/route.ts (19 ago 2026) para poder reusarlo también
// desde costs/inform/route.ts sin duplicar las mismas dos queries.

export interface SignerProfile {
  userId: string;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface SignatureRecord extends SignerProfile {
  signedAt: string;
}

export interface SignaturesState {
  requiredSigners: SignerProfile[];
  signatures: SignatureRecord[];
  allSigned: boolean;
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
// siempre devolvía 0 firmantes requeridos. Bug encontrado el 19 ago 2026.
export async function getRequiredSigners(
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

/** Firmantes requeridos + quiénes ya firmaron (incluye firmantes
 * "voluntarios" que firmaron sin ser requeridos) + si ya están todos. */
export async function getSignaturesState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  showId: string,
  projectId: string
): Promise<SignaturesState> {
  const requiredSigners = await getRequiredSigners(supabase, projectId);

  const { data: sigRows } = await supabase
    .from("event_closing_signatures")
    .select("user_id, signed_at, profiles ( full_name, email, avatar_url )")
    .eq("show_id", showId)
    .order("signed_at", { ascending: true });

  const signatures: SignatureRecord[] = (sigRows ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (s: any) => ({
      userId: s.user_id,
      signedAt: s.signed_at,
      fullName: s.profiles?.full_name ?? null,
      email: s.profiles?.email ?? null,
      avatarUrl: s.profiles?.avatar_url ?? null,
    })
  );

  const signedIds = new Set(signatures.map((s) => s.userId));
  const allSigned = requiredSigners.length > 0 && requiredSigners.every((r) => signedIds.has(r.userId));

  return { requiredSigners, signatures, allSigned };
}
