"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

interface Candidate {
  pageId: string;
  pageName: string;
  igUserId: string;
  igUsername: string;
}

export default function ConnectInstagramPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pendingId = searchParams.get("pending");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingId) {
      setLoadError("Falta información de la conexión");
      setLoading(false);
      return;
    }
    fetch(`/api/integrations/meta/pending?id=${pendingId}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? "No se pudo cargar");
        }
        return res.json();
      })
      .then((data) => setCandidates(data.candidates ?? []))
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [pendingId]);

  const handleChoose = async (candidate: Candidate) => {
    setConfirmingId(candidate.igUserId);
    try {
      const res = await fetch("/api/integrations/meta/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId, igUserId: candidate.igUserId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "Error al conectar");
        return;
      }
      toast.success(`Instagram conectado: ${data.accountName}`);
      router.push("/analytics/instagram?connected=instagram");
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-16 space-y-6">
      <div className="text-center space-y-2">
        <Camera className="h-8 w-8 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-bold">Elige la cuenta de Instagram</h1>
        <p className="text-sm text-muted-foreground">
          Encontramos varias páginas de Facebook con Instagram vinculado. Elige cuál corresponde a este proyecto.
        </p>
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {loadError && !loading && (
        <p className="text-sm text-destructive text-center">{loadError}</p>
      )}

      {!loading && !loadError && (
        <div className="space-y-2">
          {candidates.map((candidate) => (
            <Card key={candidate.igUserId} className="p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">@{candidate.igUsername}</p>
                <p className="text-xs text-muted-foreground">Página de Facebook: {candidate.pageName}</p>
              </div>
              <Button
                size="sm"
                onClick={() => handleChoose(candidate)}
                disabled={confirmingId !== null}
              >
                {confirmingId === candidate.igUserId && (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                )}
                Conectar esta cuenta
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
