import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActivityLogInput {
  supabase: SupabaseClient;
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  projectId?: string | null;
}

export async function logActivity({
  supabase,
  userId,
  userEmail,
  action,
  entityType,
  entityId = null,
  entityName = null,
  projectId = null,
}: ActivityLogInput): Promise<void> {
  try {
    let resolvedUserId = userId ?? null;
    let resolvedEmail = userEmail ?? null;

    if (!resolvedUserId || !resolvedEmail) {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (!authError && authData?.user) {
        resolvedUserId = resolvedUserId ?? authData.user.id;
        resolvedEmail = resolvedEmail ?? authData.user.email ?? null;
      }
    }

    const { error } = await supabase.from("activity_logs").insert({
      user_id: resolvedUserId,
      user_email: resolvedEmail,
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      project_id: projectId,
    });

    if (error) {
      console.error("Failed to insert activity log:", error);
    }
  } catch (err) {
    console.error("Unexpected error logging activity:", err);
  }
}
