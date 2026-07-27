"use client";

import { useState, useEffect } from "react";
import { LeadCandidatesInbox } from "@/components/lead-candidates/LeadCandidatesInbox";
import { useProject } from "@/lib/project-context";
import type { LeadCandidate } from "@/types";

export default function LeadCandidatesPage() {
  const [leads, setLeads] = useState<LeadCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const { activeProject } = useProject();

  const loadLeads = () => {
    const params = activeProject ? `?projectId=${activeProject.id}` : "";
    fetch(`/api/lead-candidates${params}`)
      .then((res) => res.json())
      .then((data) => {
        setLeads(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bandeja de Leads</h1>
        <p className="text-muted-foreground">
          Leads detectados en mail y WhatsApp, esperando tu revisión antes de
          crear el contacto en el CRM.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <LeadCandidatesInbox leads={leads} onDecisionMade={loadLeads} />
      )}
    </div>
  );
}
