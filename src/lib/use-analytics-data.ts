"use client";

import { useState, useEffect, useCallback } from "react";
import { useProject } from "@/lib/project-context";
import type { Show, SocialMetric, MerchSnapshot, ShopifyProduct, ShopifySalesMonth, SpotifyStatsSnapshot } from "@/types/analytics";

export interface MetaIntegration {
  connected: boolean;
  accountName?: string;
  lastSyncAt?: string;
  tokenExpiresAt?: string;
}

export interface ShopifyIntegration {
  connected: boolean;
  accountName?: string;
  lastSyncAt?: string;
  collectionTitle?: string | null;
}

export interface FacebookIntegration {
  connected: boolean;
  accountName?: string;
  lastSyncAt?: string;
}

export function useAnalyticsData() {
  const [shows, setShows] = useState<Show[]>([]);
  const [social, setSocial] = useState<SocialMetric[]>([]);
  const [merch, setMerch] = useState<MerchSnapshot[]>([]);
  const [shopifyProducts, setShopifyProducts] = useState<ShopifyProduct[]>([]);
  const [shopifySales, setShopifySales] = useState<ShopifySalesMonth[]>([]);
  const [metaIntegration, setMetaIntegration] = useState<MetaIntegration>({ connected: false });
  const [shopifyIntegration, setShopifyIntegration] = useState<ShopifyIntegration>({ connected: false });
  const [facebookIntegration, setFacebookIntegration] = useState<FacebookIntegration>({ connected: false });
  const [spotifyStats, setSpotifyStats] = useState<SpotifyStatsSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const { activeProject, isAllProjects } = useProject();

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (isAllProjects) {
        params.set("isAllProjects", "true");
      } else if (activeProject?.id) {
        params.set("projectId", activeProject.id);
      }
      const qs = params.toString() ? `?${params.toString()}` : "";

      const [showsRes, socialRes, merchRes, statusRes, shopifyRes, shopifyStatusRes, facebookStatusRes, spotifyStatsRes] = await Promise.all([
        fetch(`/api/analytics/shows${qs}`),
        fetch(`/api/analytics/social${qs}`),
        fetch(`/api/analytics/merch${qs}`),
        fetch(`/api/integrations/meta/status${qs}`),
        fetch(`/api/analytics/shopify${qs}`),
        fetch(`/api/integrations/shopify/status${qs}`),
        fetch(`/api/integrations/facebook/status${qs}`),
        fetch(`/api/analytics/spotify${qs}`),
      ]);
      const [showsData, socialData, merchData, statusData, shopifyData, shopifyStatusData, facebookStatusData, spotifyStatsData] = await Promise.all([
        showsRes.ok ? showsRes.json() : [],
        socialRes.ok ? socialRes.json() : [],
        merchRes.ok ? merchRes.json() : [],
        statusRes.ok ? statusRes.json() : { connected: false },
        shopifyRes.ok ? shopifyRes.json() : { products: [], salesByMonth: [] },
        shopifyStatusRes.ok ? shopifyStatusRes.json() : { connected: false },
        facebookStatusRes.ok ? facebookStatusRes.json() : { connected: false },
        spotifyStatsRes.ok ? spotifyStatsRes.json() : [],
      ]);
      setShows(Array.isArray(showsData) ? showsData : []);
      setSocial(Array.isArray(socialData) ? socialData : []);
      setMerch(Array.isArray(merchData) ? merchData : []);
      setMetaIntegration(statusData);
      setShopifyProducts(Array.isArray(shopifyData?.products) ? shopifyData.products : []);
      setShopifySales(Array.isArray(shopifyData?.salesByMonth) ? shopifyData.salesByMonth : []);
      setShopifyIntegration(shopifyStatusData);
      setFacebookIntegration(facebookStatusData);
      setSpotifyStats(Array.isArray(spotifyStatsData) ? spotifyStatsData : []);
    } finally {
      setLoading(false);
    }
  }, [activeProject, isAllProjects]);

  useEffect(() => {
    const id = window.setTimeout(() => void loadAll(), 0);
    return () => window.clearTimeout(id);
  }, [loadAll]);

  return {
    shows,
    social,
    merch,
    shopifyProducts,
    shopifySales,
    metaIntegration,
    shopifyIntegration,
    facebookIntegration,
    spotifyStats,
    loading,
    refresh: loadAll,
  };
}
