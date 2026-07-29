"use client";

import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, User } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { OrgMember } from "@/components/shared/AssigneeSelector";

// ─── Comentarios con @menciones, compartido por Tareas y Tratos ─────────────
// Extraido de TaskDetailSheet.tsx, donde vivia inline junto al resto del
// detalle de la tarea. El fetch de orgMembers vive aca adentro (solo
// necesita projectId) para que el componente sea autocontenido; quien lo
// usa solo necesita darle los comentarios ya cargados y una funcion
// onSubmit que hable con el endpoint correcto (tasks o deals).

export interface CommentItemData {
  id: string;
  content: string;
  author: string;
  createdAt: string | number | Date;
}

function CommentItem({ comment }: { comment: CommentItemData }) {
  const date = comment.createdAt instanceof Date
    ? comment.createdAt
    : new Date(
        typeof comment.createdAt === "number" && comment.createdAt < 1e12
          ? comment.createdAt * 1000
          : comment.createdAt
      );
  const isValidDate = !Number.isNaN(date.getTime());

  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <User className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">{comment.author}</span>
          <span className="text-xs text-muted-foreground">
            {isValidDate ? format(date, "d MMM yyyy, HH:mm", { locale: es }) : "Fecha no disponible"}
          </span>
        </div>
        <p className="text-sm text-foreground whitespace-pre-wrap break-words">{comment.content}</p>
      </div>
    </div>
  );
}

export function CommentsWithMentions({
  comments,
  projectId,
  orgMembers: orgMembersProp,
  onSubmit,
  emptyLabel = "Sin comentarios aún.",
}: {
  comments: CommentItemData[];
  projectId: string | null;
  /** Si el padre ya tiene los miembros del proyecto cargados (ej. para el selector de responsables), pasarlos aca evita un fetch duplicado. */
  orgMembers?: OrgMember[];
  onSubmit: (content: string, mentionedUserIds: string[]) => Promise<boolean>;
  emptyLabel?: string;
}) {
  const [fetchedOrgMembers, setFetchedOrgMembers] = useState<OrgMember[]>([]);
  const orgMembers = orgMembersProp ?? fetchedOrgMembers;
  const [newComment, setNewComment] = useState("");
  const [mentionedIds, setMentionedIds] = useState<Set<string>>(new Set());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (orgMembersProp) return; // el padre ya los provee, no volver a pedirlos
    if (!projectId) {
      setFetchedOrgMembers([]);
      return;
    }
    fetch(`/api/project-members?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => setFetchedOrgMembers(Array.isArray(data) ? data : []))
      .catch(() => setFetchedOrgMembers([]));
  }, [projectId, orgMembersProp]);

  const handleCommentChange = (value: string) => {
    setNewComment(value);
    // Detecta un "@algo" activo al final del texto escrito hasta ahora
    // (simplificacion: no maneja edicion a mitad de texto, solo el caso
    // comun de escribir @ y seguir tipeando al final).
    const match = value.match(/@([^\s@]*)$/);
    setMentionQuery(match ? match[1] : null);
  };

  const handleSelectMention = (member: OrgMember) => {
    const name = member.profiles?.full_name || member.profiles?.email || "Usuario";
    setNewComment((prev) => prev.replace(/@([^\s@]*)$/, `@${name} `));
    setMentionedIds((prev) => new Set(prev).add(member.user_id));
    setMentionQuery(null);
  };

  const handleAdd = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    const ok = await onSubmit(newComment.trim(), Array.from(mentionedIds));
    setSubmitting(false);
    if (ok) {
      setNewComment("");
      setMentionedIds(new Set());
      setMentionQuery(null);
    }
  };

  const filteredMembers = mentionQuery === null
    ? []
    : orgMembers.filter((m) => {
        const name = m.profiles?.full_name || m.profiles?.email || "";
        return name.toLowerCase().includes(mentionQuery.toLowerCase());
      });

  return (
    <div>
      <div className="space-y-4 mb-4">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          comments.map((c) => <CommentItem key={c.id} comment={c} />)
        )}
      </div>

      <div className="flex gap-2 relative">
        {mentionQuery !== null && orgMembers.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 w-64 max-h-40 overflow-y-auto rounded border bg-popover shadow-md z-10">
            {filteredMembers.map((m) => (
              <button
                key={m.user_id}
                type="button"
                onClick={() => handleSelectMention(m)}
                className="flex w-full flex-col items-start px-2 py-1.5 text-sm hover:bg-muted/40 cursor-pointer text-left border-b last:border-b-0"
              >
                <span className="font-medium">{m.profiles?.full_name || "Sin nombre"}</span>
                {m.profiles?.email && (
                  <span className="text-xs text-muted-foreground">{m.profiles.email}</span>
                )}
              </button>
            ))}
            {filteredMembers.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Nadie coincide</p>
            )}
          </div>
        )}
        <Textarea
          value={newComment}
          onChange={(e) => handleCommentChange(e.target.value)}
          placeholder="Escribe un comentario... (usa @ para etiquetar a alguien)"
          className="text-sm min-h-[60px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleAdd();
            }
            if (e.key === "Escape") setMentionQuery(null);
          }}
        />
        <Button
          size="sm"
          className="shrink-0 self-end cursor-pointer"
          disabled={!newComment.trim() || submitting}
          onClick={() => void handleAdd()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">Cmd+Enter para enviar</p>
    </div>
  );
}
