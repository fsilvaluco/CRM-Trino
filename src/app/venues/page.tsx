"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { VenueFormDialog } from "@/components/venues/VenueFormDialog";
import { useProject } from "@/lib/project-context";
import { toast } from "sonner";
import { MapPin, Plus, Pencil, Trash2, Search, Users2, Building2 } from "lucide-react";
import type { VenueWithDetails } from "@/types/venues";

export default function VenuesPage() {
  const { activeProject } = useProject();
  const [venues, setVenues] = useState<VenueWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<VenueWithDetails | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Esta página muestra SOLO los venues que el proyecto activo ya usó
  // (onlyUsed=true) -- si otro proyecto cargó un venue pero el nuestro
  // nunca lo tocó, no aparece aquí. Para reutilizar un venue de otro
  // proyecto hay que buscarlo desde el selector de "nuevo evento", que
  // sí muestra el catálogo completo.
  const load = useCallback(() => {
    if (!activeProject?.id) {
      setVenues([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ onlyUsed: "true", projectId: activeProject.id });
    if (search) params.set("search", search);
    fetch(`/api/venues?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setVenues(Array.isArray(d) ? d : []))
      .catch(() => setVenues([]))
      .finally(() => setLoading(false));
  }, [search, activeProject?.id]);

  useEffect(() => {
    const id = window.setTimeout(load, 200);
    return () => window.clearTimeout(id);
  }, [load]);

  async function handleDelete(venue: VenueWithDetails) {
    if (!activeProject?.id) return;
    if (!confirm(`¿Quitar "${venue.name}" de tus venues? El lugar sigue existiendo en el catálogo si otro proyecto lo usa -- esto solo quita tus datos privados (capacidad, contacto, etc.). Esta acción no se puede deshacer.`)) return;
    setDeletingId(venue.id);
    try {
      const res = await fetch(`/api/venues/${venue.id}?projectId=${activeProject.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo quitar el venue");
        return;
      }
      setVenues((prev) => prev.filter((v) => v.id !== venue.id));
      toast.success("Venue quitado de tu proyecto");
    } catch {
      toast.error("No se pudo quitar el venue");
    } finally {
      setDeletingId(null);
    }
  }

  if (!activeProject?.id) {
    return (
      <EmptyState
        icon={MapPin}
        title="Selecciona un proyecto"
        description="Los venues son privados por proyecto -- elige un proyecto arriba para ver los suyos."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Venues</h1>
          <p className="text-muted-foreground">
            Lugares que {activeProject.name} ya usó. Para reutilizar uno cargado por otro
            proyecto, búscalo desde el selector de venue al crear un evento.
          </p>
        </div>
        <Button
          className="cursor-pointer"
          onClick={() => {
            setEditingVenue(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Nuevo venue
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : venues.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Sin venues"
          description="Crea tu primer venue, o simplemente créalo al vuelo la próxima vez que armes un evento."
        />
      ) : (
        <div className="space-y-3">
          {venues.map((venue) => {
            const details = venue.details;
            const capacityParts = [
              details?.capacityStanding != null ? `${details.capacityStanding} parado` : null,
              details?.capacitySeated != null ? `${details.capacitySeated} sentado` : null,
            ].filter(Boolean);

            return (
              <Card key={venue.id} className="group">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-medium">{venue.name}</p>
                      {details?.mood && <Badge variant="outline" className="text-xs">{details.mood}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {venue.address}
                        {venue.comuna ? `, ${venue.comuna}` : ""}
                      </span>
                      {capacityParts.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Users2 className="h-3.5 w-3.5" />
                          {capacityParts.join(" / ")}
                        </span>
                      )}
                      {details?.companyName && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {details.companyName}
                        </span>
                      )}
                    </div>
                    {details?.description && (
                      <p className="text-sm text-muted-foreground mt-1.5">{details.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => {
                        setEditingVenue(venue);
                        setFormOpen(true);
                      }}
                      className="text-muted-foreground hover:text-foreground cursor-pointer p-1.5"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(venue)}
                      disabled={deletingId === venue.id}
                      className="text-muted-foreground hover:text-destructive cursor-pointer p-1.5 disabled:opacity-50"
                      title="Quitar de mis venues"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <VenueFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editingVenue={editingVenue}
        projectId={activeProject.id}
        onSaved={load}
      />
    </div>
  );
}
