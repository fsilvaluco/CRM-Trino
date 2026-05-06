"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase, maybeReinitializeClient } from "@/lib/supabase";
import { useProject } from "@/lib/project-context";
import { useAuth } from "@/lib/auth-context";

import { KPICards } from "@/components/dashboard/KPICards";
import { PipelineChart } from "@/components/dashboard/PipelineChart";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { NotificationBanner } from "@/components/dashboard/NotificationBanner";
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
    console.log('[Dashboard] loadDashboard called', { userId, hasSession: !!session, tokenPreview: session?.access_token?.slice(0, 20) });
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
      // Obtener org_id del usuario con timeout de 8s (reducido con botón manual)
      console.log('[Dashboard] Fetching organization_id...');
      console.log('[Dashboard] Query params:', { userId, hasSupabase: !!supabase });
      
      const orgQuery = supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userId)
        .single();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout after 8000ms')), 8000)
      );

      const timeoutStart = Date.now();
      const result = await Promise.race([orgQuery, timeoutPromise]);
      const timeoutEnd = Date.now();
      console.log('[Dashboard] Query completed in', timeoutEnd - timeoutStart, 'ms');
      
      const { data: memberRow, error: memberError } = result as any;

      console.log('[Dashboard] Got response:', { hasData: !!memberRow, hasError: !!memberError, error: memberError });

      if (memberError) {
        console.error('[Dashboard] Error fetching orgId:', memberError);
        console.error('[Dashboard] Error details:', { code: memberError.code, message: memberError.message, hint: memberError.hint });
        return;
      }

      const orgId = memberRow?.organization_id;
      if (!orgId) {
        console.log('[Dashboard] No orgId found');
        return;
      }
      console.log('[Dashboard] Got orgId:', orgId);

      const projectFilter = !isAllProjects && activeProjectId ? activeProjectId : null;

      // Queries en paralelo
      let contactsQ = supabase.from("contacts").select("id, temperature").eq("organization_id", orgId).is("deleted_at", null);
      let dealsQ = supabase.from("deals").select("id, value, stage_id").eq("organization_id", orgId).is("deleted_at", null);
      let activitiesQ = supabase.from("activities").select("id, type, description, created_at, contacts ( name )").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(5);

      if (projectFilter) {
        contactsQ = contactsQ.eq("project_id", projectFilter);
        dealsQ = dealsQ.eq("project_id", projectFilter);
        activitiesQ = activitiesQ.eq("project_id", projectFilter);
      }

      // Ejecutar queries en paralelo con timeout (reducido a 5s con botón manual)
      console.log('[Dashboard] Fetching parallel queries...');
      const queriesStart = Date.now();
      
      const queriesPromise = Promise.all([
        contactsQ,
        dealsQ,
        supabase.from("pipeline_stages").select("id, name, color, is_won, is_lost").eq("organization_id", orgId).order("order"),
        activitiesQ,
      ]);

      const queriesTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Parallel queries timeout after 5000ms')), 5000)
      );

      const results = await Promise.race([queriesPromise, queriesTimeout]);
      const queriesEnd = Date.now();
      console.log('[Dashboard] Parallel queries completed in', queriesEnd - queriesStart, 'ms');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [
        { data: allContacts },
        { data: allDeals },
        { data: stages },
        { data: recentActivities },
      ] = results as any;

      const contacts = allContacts ?? [];
      const deals = allDeals ?? [];
      const pipelineStages = stages ?? [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activeDeals = deals.filter((d: any) => {
        const stage = pipelineStages.find((s: any) => s.id === d.stage_id);
        return stage && !stage.is_won && !stage.is_lost;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wonDeals = deals.filter((d: any) => {
        const stage = pipelineStages.find((s: any) => s.id === d.stage_id);
        return stage?.is_won;
      });

      setStats({
        totalContacts: contacts.length,
        activeDeals: activeDeals.length,
        totalPipelineValue: activeDeals.reduce((sum: number, d: any) => sum + d.value, 0),
        wonDealsValue: wonDeals.reduce((sum: number, d: any) => sum + d.value, 0),
        conversionRate: deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 100) : 0,
        hotLeads: contacts.filter((c: any) => c.temperature === "hot").length,
      });

      setPipelineData(
        pipelineStages
          .filter((s: any) => !s.is_lost)
          .map((stage: any) => ({
            name: stage.name,
            count: deals.filter((d: any) => d.stage_id === stage.id).length,
            value: deals.filter((d: any) => d.stage_id === stage.id).reduce((sum: number, d: any) => sum + d.value, 0),
            color: stage.color,
          }))
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setActivities((recentActivities ?? []).map((a: any) => ({
        id: a.id,
        type: a.type,
        description: a.description,
        contactName: a.contacts?.name ?? null,
        createdAt: a.created_at,
      })));
      console.log('[Dashboard] Data loaded successfully');
      setIsStale(false);
      setLastSuccessfulLoad(new Date());
    } catch (error) {
      console.error("[Dashboard] Failed to load data", error);
      // Distinguir entre timeout y otros errores
      if (error instanceof Error && error.message.includes('timeout')) {
        const timeoutMsg = error.message.includes('Parallel queries') 
          ? 'Supabase queries hung after visibilitychange - they will eventually resolve'
          : 'Organization query timeout - possible RLS policy issue';
        console.error(`[Dashboard] TIMEOUT: ${timeoutMsg}`);
        // Mark data as stale but keep showing it (snapshot approach)
        setIsStale(true);
      } else {
        console.error('[Dashboard] UNEXPECTED ERROR:', error);
        // For non-timeout errors, clear the dashboard
        setStats(defaultStats);
        setPipelineData([]);
        setActivities([]);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [activeProjectId, isAllProjects, userId, session?.access_token]);

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
        // Reinitialize Supabase client to prevent hung queries after tab freeze/thaw
        maybeReinitializeClient();
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
          <h2 className="text-lg font-semibold mb-2">Bienvenido a Trino-Control</h2>
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

      <NotificationBanner />

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
