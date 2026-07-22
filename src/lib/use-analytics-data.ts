"use client";

import { useState, useEffect, useCallback } from "react";
import { useProject } from "@/lib/project-context";
import type { Show, SocialMetric, MerchSnapshot } from "@/types/analytics";

export interface MetaIntegration {
  connected: boolean;
  accountName?: string;
  lastSyncAt?: string;
  tokenExpiresAt?: string;
}

export function useAnalyticsData() {
  const [shows, setShows] = useState<Show[]>([]);
  const [social, setSocial] = useState<SocialMetric[]>([]);
  const [merch, setMerch] = useState<MerchSnapshot[]>([]);
  const [metaIntegration, setMetaIntegration] = useState<MetaIntegration>({ connected: false });
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

      const [showsRes, socialRes, merchRes, statusRes] = await Promise.all([
        fetch(`/api/analytics/shows${qs}`),
        fetch(`/api/analytics/social${qs}`),
        fetch(`/api/analytics/merch${qs}`),
        fetch(`/api/integrations/meta/status${qs}`),
      ]);
      const [showsData, socialData, merchData, statusData] = await Promise.all([
        showsRes.ok ? showsRes.json() : [],
        socialRes.ok ? socialRes.json() : [],
        merchRes.ok ? merchRes.json() : [],
        statusRes.ok ? statusRes.json() : { connected: false },
      ]);
      setShows(Array.isArray(showsData) ? showsData : []);
      setSocial(Array.isArray(socialData) ? socialData : []);
      setMerch(Array.isArray(merchData) ? merchData : []);
      setMetaIntegration(statusData);
    } finally {
      setLoading(false);
    }
  }, [activeProject, isAllProjects]);

  useEffect(() => {
    const id = window.setTimeout(() => void loadAll(), 0);
    return () => window.clearTimeout(id);
  }, [loadAll]);

  return { shows, social, merch, metaIntegration, loading, refresh: loadAll };
}
