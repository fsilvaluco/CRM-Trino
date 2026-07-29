// ─── Stack de avatares de responsables, compartido por las tarjetas de ──────
// Kanban de Tareas y Tratos. Extraido de TaskKanbanBoard.tsx.

export interface AssigneeRef {
  userId: string;
  profile?: {
    fullName: string | null;
    avatarUrl: string | null;
    email: string | null;
  } | null;
}

export function AssigneeAvatarStack({ assignees }: { assignees: AssigneeRef[] }) {
  if (!assignees || assignees.length === 0) return null;

  return (
    <div className="flex items-center gap-1 mt-1">
      {assignees.slice(0, 3).map((assignee, idx) => {
        const displayName = assignee.profile?.fullName || assignee.profile?.email || "?";
        const initials = displayName
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);
        return (
          <div
            key={assignee.userId}
            className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium"
            style={{ marginLeft: idx > 0 ? "-8px" : "0" }}
            title={displayName}
          >
            {initials}
          </div>
        );
      })}
      {assignees.length > 3 && (
        <div
          className="w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center font-medium"
          style={{ marginLeft: "-8px" }}
        >
          +{assignees.length - 3}
        </div>
      )}
    </div>
  );
}
