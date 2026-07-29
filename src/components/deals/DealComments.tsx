"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CommentsWithMentions, type CommentItemData } from "@/components/shared/CommentsWithMentions";

export function DealComments({ dealId, projectId }: { dealId: string; projectId: string | null }) {
  const [comments, setComments] = useState<CommentItemData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/deals/${dealId}/comments`)
      .then((r) => r.json())
      .then((d) => setComments(Array.isArray(d) ? d : []))
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  }, [dealId]);

  async function handleSubmit(content: string, mentionedUserIds: string[]) {
    try {
      const res = await fetch(`/api/deals/${dealId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mentionedUserIds }),
      });
      if (!res.ok) throw new Error();
      const comment = await res.json();
      setComments((prev) => [...prev, comment]);
      return true;
    } catch {
      toast.error("Error al agregar comentario");
      return false;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comentarios ({comments.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-16 rounded-lg bg-muted animate-pulse" />
        ) : (
          <CommentsWithMentions
            comments={comments}
            projectId={projectId}
            onSubmit={handleSubmit}
          />
        )}
      </CardContent>
    </Card>
  );
}
