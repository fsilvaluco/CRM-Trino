// Fila de deal_assignees / task_assignees tal como la devuelve Supabase con
// el join a profiles. Compartido por las rutas de deals, pipeline y tasks
// (antes cada una tenia su copia del mismo map tipado con `any`).
export interface AssigneeRow {
  user_id: string;
  assigned_at: string | null;
  profiles?: {
    full_name: string | null;
    avatar_url: string | null;
    email: string | null;
  } | null;
}

export function mapAssigneeRows(rows: AssigneeRow[] | null | undefined) {
  return (rows ?? []).map((a) => ({
    userId: a.user_id,
    assignedAt: a.assigned_at,
    profile: a.profiles
      ? {
          fullName: a.profiles.full_name,
          avatarUrl: a.profiles.avatar_url,
          email: a.profiles.email,
        }
      : null,
  }));
}
