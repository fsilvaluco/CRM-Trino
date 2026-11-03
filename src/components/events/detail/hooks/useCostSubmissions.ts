"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { CostSubmission } from "../types";

// Gastos reportados por el equipo (link /eventos/[id]/gastos) que quedan
// pendientes de aprobar antes de entrar a la Planilla.
export function useCostSubmissions({ id, reload }: { id: string; reload: () => void }) {
  const [submissions, setSubmissions] = useState<CostSubmission[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const loadSubmissions = useCallback(() => {
    fetch(`/api/eventos/${id}/cost-submissions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setSubmissions(data.submissions ?? []);
        setCanReview(Boolean(data.canReview));
      })
      .catch(() => {});
  }, [id]);

  async function review(submissionId: string, decision: "approve" | "reject", reviewNote?: string) {
    setReviewingId(submissionId);
    try {
      const res = await fetch(`/api/eventos/${id}/cost-submissions/${submissionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reviewNote: reviewNote || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "No se pudo revisar el gasto");
        return;
      }
      toast.success(decision === "approve" ? "Gasto aprobado y agregado a la Planilla" : "Gasto rechazado y eliminado");
      loadSubmissions();
      if (decision === "approve") reload();
    } catch {
      toast.error("No se pudo revisar el gasto");
    } finally {
      setReviewingId(null);
    }
  }

  return { submissions, canReview, reviewingId, loadSubmissions, review };
}

export type CostSubmissionsState = ReturnType<typeof useCostSubmissions>;
