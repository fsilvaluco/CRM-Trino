"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface DealComment {
  id: string;
  content: string;
  author: string;
  createdAt: string;
}

export function DealComments({ dealId }: { dealId: string }) {
  const [comments, setComments] = useState<DealComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/deals/${dealId}/comments`)
      .then((r) => r.json())
      .then((d) => setComments(Array.isArray(d) ? d : []))
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  }, [dealId]);

  async function handleAdd() {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      if (!res.ok) throw new Error();
      const comment = await res.json();
      setComments((prev) => [...prev, comment]);
      setNewComment("");
    } catch {
      toast.error("Error al agregar comentario");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comentarios ({comments.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="h-16 rounded-lg bg-muted animate-pulse" />
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin comentarios aún.</p>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {comments.map((c) => (
              <div key={c.id} className="text-sm bg-muted/40 rounded-md px-3 py-2">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="font-medium text-xs">{c.author}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(c.createdAt), "d MMM, HH:mm", { locale: es })}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{c.content}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Escribe un comentario..."
            className="text-sm min-h-[44px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleAdd();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            className="shrink-0 self-end cursor-pointer"
            disabled={!newComment.trim() || submitting}
            onClick={() => void handleAdd()}
          >
            {submitting ? "..." : "Enviar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
