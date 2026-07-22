"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { AnalyticsPageHeader } from "@/components/analytics/AnalyticsPageHeader";
import { PlatformTab } from "@/components/analytics/PlatformTab";
import { useAnalyticsData } from "@/lib/use-analytics-data";

const ERROR_MESSAGES: Record<string, string> = {
  meta_denied: "Conexión cancelada",
  meta_state_mismatch: "Error de seguridad al conectar — intenta de nuevo",
  meta_no_project: "Selecciona un proyecto antes de conectar",
  meta_token_error: "Error al conectar con Meta — intenta de nuevo",
  meta_no_ig_account: "No encontramos una cuenta de Instagram Business vinculada a tus páginas de Facebook",
};

export default function AnalyticsInstagramPage() {
  const { social, metaIntegration, loading, refresh } = useAnalyticsData();
  const searchParams = useSearchParams();

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected === "instagram") {
      toast.success("Instagram conectado correctamente");
    } else if (error) {
      toast.error(ERROR_MESSAGES[error] ?? "Error al conectar Instagram");
    }
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader icon={Camera} title="Instagram" description="Seguidores y conexión de la cuenta" />
      {loading ? (
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      ) : (
        <PlatformTab platform="instagram" metrics={social} onRefresh={refresh} integration={metaIntegration} />
      )}
    </div>
  );
}
