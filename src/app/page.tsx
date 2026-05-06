"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
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
      // Obtener org_id del usuario con timeout de 15s (aumentado para debugging)
      console.log('[Dashboard] Fetching organization_id...');
      console.log('[Dashboard] Query params:', { userId, hasSupabase: !!supabase });
      
      const orgQuery = supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userId)
        .single();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout after 15000ms')), 15000)
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

      const [
        { data: allContacts },
        { data: allDeals },
        { data: stages },
        { data: recentActivities },
      ] = await Promise.all([
        contactsQ,
        dealsQ,
        supabase.from("pipeline_stages").select("id, name, color, is_won, is_lost").eq("organization_id", orgId).order("order"),
        activitiesQ,
      ]);

      const contacts = allContacts ?? [];
      const deals = allDeals ?? [];
      const pipelineStages = stages ?? [];

      const activeDeals = deals.filter((d) => {
        const stage = pipelineStages.find((s) => s.id === d.stage_id);
        return stage && !stage.is_won && !stage.is_lost;
      });
      const wonDeals = deals.filter((d) => {
        const stage = pipelineStages.find((s) => s.id === d.stage_id);
        return stage?.is_won;
      });

      setStats({
        totalContacts: contacts.length,
        activeDeals: activeDeals.length,
        totalPipelineValue: activeDeals.reduce((sum, d) => sum + d.value, 0),
        wonDealsValue: wonDeals.reduce((sum, d) => sum + d.value, 0),
        conversionRate: deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 100) : 0,
        hotLeads: contacts.filter((c) => c.temperature === "hot").length,
      });

      setPipelineData(
        pipelineStages
          .filter((s) => !s.is_lost)
          .map((stage) => ({
            name: stage.name,
            count: deals.filter((d) => d.stage_id === stage.id).length,
            value: deals.filter((d) => d.stage_id === stage.id).reduce((sum, d) => sum + d.value, 0),
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
    } catch (error) {
      console.error("[Dashboard] Failed to load data", error);
      // Distinguir entre timeout y otros errores
      if (error instanceof Error && error.message.includes('timeout')) {
        console.error('[Dashboard] TIMEOUT: Query took longer than 15s - possible Supabase connection issue or RLS policy problem');
      } else {
        console.error('[Dashboard] UNEXPECTED ERROR:', error);
      }
      // Keep previous dashboard snapshot; this can fail transiently on tab resume.
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
