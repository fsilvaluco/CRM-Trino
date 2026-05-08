"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useProject } from "@/lib/project-context";
import { useAuth } from "@/lib/auth-context";

import { KPICards } from "@/components/dashboard/KPICards";
import { PipelineChart } from "@/components/dashboard/PipelineChart";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import type { DashboardStats } from "@/types";

interface StageData { name: string; count: number; value: number; color: string; }
interface ActivityItem { id: string; type: string; description: string; contactName: string | null; createdAt: number | Date; }

const defaultStats: DashboardStats = {
  totalContacts: 0,
  activeDeals: 0,
  totalPipelineValue: 0,
  wonDealsValue: 0,
  conversionRate: 0,
  hotLeads: 0,
};

export default function DashboardPage() {
  const { user, session } = useAuth();
  const { activeProject, isAllProjects } = useProject();
  const userId = user?.id ?? null;
  const activeProjectId = activeProject?.id ?? null;
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [pipelineData, setPipelineData] = useState<StageData[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [lastSuccessfulLoad, setLastSuccessfulLoad] = useState<Date | null>(null);
  const loadingRef = useRef(false);

  const loadDashboard = useCallback(async () => {
    console.log('[Dashboard] loadDashboard called', { userId, hasSession: !!session, activeProjectId, isAllProjects });
    if (!userId) {
      console.log('[Dashboard] No userId, aborting');
      return;
    }
    
    // Prevent concurrent executions
    if (loadingRef.current) {
      console.log('[Dashboard] Already loading, skipping');
      return;
    }
    
    loadingRef.current = true;
    setLoading(true);

    try {
      console.log('[Dashboard] Fetching from API route...');
      const startTime = Date.now();
      
      // Build query params
      const params = new URLSearchParams();
      if (activeProjectId && !isAllProjects) {
        params.set('projectId', activeProjectId);
      }
      params.set('isAllProjects', isAllProjects.toString());

      const url = `/api/dashboard?${params.toString()}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for auth
      });

      const endTime = Date.now();
      console.log('[Dashboard] API request completed in', endTime - startTime, 'ms');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // Update state with data from API
      setStats(data.stats);
      setPipelineData(data.pipelineData);
      setActivities(data.activities);
      
      console.log('[Dashboard] Data loaded successfully from API', { queryTime: data.queryTime });
      setIsStale(false);
      setLastSuccessfulLoad(new Date());
      
    } catch (error) {
      console.error("[Dashboard] Failed to load data", error);
      
      if (error instanceof Error) {
        console.error('[Dashboard] Error details:', error.message);
        // Mark data as stale but keep showing it (snapshot approach)
        setIsStale(true);
      } else {
        console.error('[Dashboard] UNEXPECTED ERROR:', error);
        // For non-error objects, clear the dashboard
        setStats(defaultStats);
        setPipelineData([]);
        setActivities([]);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [activeProjectId, isAllProjects, userId, session]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadDashboard]);

  // Recargar datos cuando el usuario vuelve a la pestaña/app
  useEffect(() => {
    const handleVisible = () => {
      console.log('[Dashboard] visibilitychange event', { state: document.visibilityState });
      if (document.visibilityState === "visible") {
        // Simply reload dashboard - server-side API handles Supabase connection
        void loadDashboard();
      }
    };
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, [loadDashboard]);

  const isFirstRun = !loading && stats.totalContacts === 0 && stats.activeDeals === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          {isAllProjects || !activeProject
            ? "Resumen de tu pipeline de ventas"
            : `Proyecto: ${activeProject.name}`}
        </p>
      </div>

      {isStale && lastSuccessfulLoad && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 flex items-start gap-3">
          <svg className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Hay nuevos datos disponibles
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
              Mostrando última versión exitosa ({lastSuccessfulLoad.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}). 
              Haz clic en "Recargar" para actualizar.
            </p>
          </div>
          <button
            onClick={() => {
              console.log('[Dashboard] Manual reload triggered by user');
              setIsStale(false);
              void loadDashboard();
            }}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? 'Cargando...' : 'Recargar'}
          </button>
        </div>
      )}

      {isFirstRun && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-6">
          <h2 className="text-lg font-semibold mb-2">Bienvenido a Artist Pro</h2>
          <p className="text-sm text-muted-foreground mb-4">Tu CRM esta listo. Aqui tienes como comenzar:</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="p-3 rounded-lg bg-card border">
              <p className="font-medium">1. Selecciona un proyecto</p>
              <p className="text-xs text-muted-foreground mt-1">Usa el selector en la barra superior</p>
            </div>
            <div className="p-3 rounded-lg bg-card border">
              <p className="font-medium">2. Agrega contactos</p>
              <p className="text-xs text-muted-foreground mt-1">Ve a Contactos y crea el primer lead</p>
            </div>
            <div className="p-3 rounded-lg bg-card border">
              <p className="font-medium">3. Crea deals</p>
              <p className="text-xs text-muted-foreground mt-1">Ve a Tratos para gestionar oportunidades</p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <KPICards stats={stats} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <PipelineChart data={pipelineData} />
        </div>
        <div>
          <RecentActivity activities={activities} />
        </div>
      </div>
    </div>
  );
}
