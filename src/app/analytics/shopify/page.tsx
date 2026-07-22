"use client";

import { ShoppingBag } from "lucide-react";
import { AnalyticsPageHeader } from "@/components/analytics/AnalyticsPageHeader";
import { MerchTab } from "@/components/analytics/MerchTab";
import { useAnalyticsData } from "@/lib/use-analytics-data";

export default function AnalyticsShopifyPage() {
  const { merch, loading, refresh } = useAnalyticsData();

  return (
    <div className="space-y-6">
      <AnalyticsPageHeader icon={ShoppingBag} title="Shopify" description="Ventas y stock de merch" />
      {loading ? (
        <div className="h-64 rounded-lg bg-muted animate-pulse" />
      ) : (
        <MerchTab snapshots={merch} onRefresh={refresh} />
      )}
    </div>
  );
}
