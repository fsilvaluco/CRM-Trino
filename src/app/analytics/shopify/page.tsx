"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { AnalyticsPageHeader } from "@/components/analytics/AnalyticsPageHeader";
import { MerchStoreTypeSelector, type StoreType } from "@/components/analytics/MerchStoreTypeSelector";
import { ShopifyIntegrationCard } from "@/components/analytics/ShopifyIntegrationCard";
import { MerchDashboard } from "@/components/analytics/MerchDashboard";
import { useAnalyticsData } from "@/lib/use-analytics-data";
import { useProject } from "@/lib/project-context";

const ERROR_MESSAGES: Record<string, string> = {
  shopify_denied: "Conexión cancelada",
  shopify_no_project: "Selecciona un proyecto antes de conectar",
  shopify_missing_fields: "Faltan datos: dominio de la tienda y handle de la colección",
  shopify_invalid_domain: "El dominio de la tienda no es válido (debe terminar en .myshopify.com)",
  shopify_hmac_mismatch: "Error de seguridad al conectar — intenta de nuevo",
  shopify_state_mismatch: "Error de seguridad al conectar — intenta de nuevo",
  shopify_token_error: "Error al conectar con Shopify — revisa el handle de la colección e intenta de nuevo",
};

export default function AnalyticsMerchPage() {
  const { shopifyProducts, shopifySales, shopifyIntegration, loading, refresh } = useAnalyticsData();
  const { activeProject } = useProject();
  const [storeType, setStoreType] = useState<StoreType>("shopify");
  const searchParams = useSearchParams();

  useEffect(() => {
    const connected = searchParams.get("connected");
    const err = searchParams.get("error");
    if (connected === "shopify") {
      toast.success("Shopify conectado correctamente");
    } else if (err) {
      toast.error(ERROR_MESSAGES[err] ?? "Error al conectar Shopify");
    }
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader icon={ShoppingBag} title="Merch" description="Inventario, catálogo y ventas de la tienda" />

      <MerchStoreTypeSelector value={storeType} onChange={setStoreType} />

      {loading ? (
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      ) : storeType === "shopify" ? (
        <div className="space-y-6">
          <ShopifyIntegrationCard integration={shopifyIntegration} onRefresh={refresh} projectId={activeProject?.id} />
          {shopifyIntegration.connected && (
            <MerchDashboard products={shopifyProducts} salesByMonth={shopifySales} />
          )}
        </div>
      ) : null}
    </div>
  );
}
