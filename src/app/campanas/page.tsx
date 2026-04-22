"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { SubprojectForm } from "@/components/projects/SubprojectForm";
import { SubprojectEditSheet } from "@/components/projects/SubprojectEditSheet";
import { useProject } from "@/lib/project-context";
import { Megaphone, Plus, Calendar } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Campaign {
  id: string;
  name: string;
  status: string;
  projectId: string;
  projectName: string | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  companyId: string | null;
  contactId: string | null;
  createdAt: string | number;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: { label: "Activa", className: "bg-green-100 text-green-700" },
  paused: { label: "Pausada", className: "bg-yellow-100 text-yellow-700" },
  completed: { label: "Completada", className: "bg-blue-100 text-blue-700" },
};

function formatDate(d: string | null) {
  if (!d) return null;
  try {
    return format(new Date(d), "d MMM yyyy", { locale: es });
  } catch {
    return d;
  }
}

export default function CampanasPage() {
  const router = useRouter();
  const { activeProject, isAllProjects, projects } = useProject();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const hasProjects = projects.length > 0;
  const targetProjectId = activeProject?.id ?? null;

  const loadCampaigns = useCallback(() => {
    if (!hasProjects) {
      setLoading(false);
      return;
    }
    const params = new URLSearchParams();
    if (!isAllProjects && targetProjectId) params.set("projectId", targetProjectId);
    if (filterStatus !== "all") params.set("status", filterStatus);

    setLoading(true);
    fetch(`/api/subprojects?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setCampaigns(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filterStatus, hasProjects, isAllProjects, targetProjectId]);

  const handleCampaignClick = useCallback((campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setShowEditSheet(true);
  }, []);

  const handleCampaignSaved = useCallback(() => {
    loadCampaigns();
    router.refresh();
  }, [loadCampaigns, router]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadCampaigns();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadCampaigns]);

  if (!hasProjects) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Campañas</h1>
        <EmptyState
          icon={Megaphone}
          title="Primero crea un proyecto"
          description="Las campañas pertenecen a proyectos. Selecciona o crea un proyecto desde el selector en el encabezado."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Campañas</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campañas</h1>
          <p className="text-muted-foreground">
            {isAllProjects
              ? `${campaigns.length} campaña${campaigns.length !== 1 ? "s" : ""} en todos los proyectos`
              : `${campaigns.length} campaña${campaigns.length !== 1 ? "s" : ""} en ${activeProject?.name}`}
          </p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="cursor-pointer"
          disabled={isAllProjects && projects.length > 1}
          title={isAllProjects && projects.length > 1 ? "Selecciona un proyecto específico para crear una campaña" : undefined}
        >
          <Plus className="h-4 w-4 mr-2" />
          Nueva Campaña
        </Button>
      </div>

      {showForm && targetProjectId && (
        <SubprojectForm
          open={showForm}
          projectId={targetProjectId}
          onClose={() => {
            setShowForm(false);
            loadCampaigns();
          }}
        />
      )}

      <SubprojectEditSheet
        open={showEditSheet}
        campaign={selectedCampaign}
        onClose={() => {
          setShowEditSheet(false);
          setSelectedCampaign(null);
        }}
        onSaved={handleCampaignSaved}
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {["all", "active", "paused", "completed"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${
              filterStatus === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {s === "all" ? "Todas" : STATUS_CONFIG[s]?.label || s}
          </button>
        ))}
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="Sin campañas"
          description={
            isAllProjects
              ? "No hay campañas en ninguno de tus proyectos."
              : `No hay campañas en "${activeProject?.name}". Crea la primera para empezar.`
          }
          actionLabel={!isAllProjects || projects.length === 1 ? "Nueva Campaña" : undefined}
          onAction={!isAllProjects || projects.length === 1 ? () => setShowForm(true) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign) => {
            const statusCfg = STATUS_CONFIG[campaign.status] ?? { label: campaign.status, className: "" };
            return (
              <Card
                key={campaign.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => handleCampaignClick(campaign)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleCampaignClick(campaign);
                  }
                }}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold leading-tight">{campaign.name}</h3>
                    <Badge className={`shrink-0 text-xs ${statusCfg.className}`}>
                      {statusCfg.label}
                    </Badge>
                  </div>

                  {campaign.projectName && isAllProjects && (
                    <p className="text-xs text-muted-foreground">
                      Proyecto: {campaign.projectName}
                    </p>
                  )}

                  {(campaign.startDate || campaign.endDate) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      {campaign.startDate && formatDate(campaign.startDate)}
                      {campaign.startDate && campaign.endDate && " → "}
                      {campaign.endDate && formatDate(campaign.endDate)}
                    </div>
                  )}

                  {campaign.notes && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{campaign.notes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
