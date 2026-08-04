"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { VenueFormDialog } from "@/components/venues/VenueFormDialog";
import { toast } from "sonner";
import { MapPin, Plus, Pencil, Trash2, Search, Users2, Building2 } from "lucide-react";
import type { Venue } from "@/types/venues";

export default function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    fetch(`/api/venues${params}`)
      .then((r) => r.json())
      .then((d) => setVenues(Array.isArray(d) ? d : []))
      .catch(() => setVenues([]))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    const id = window.setTimeout(load, 200);
    return () => window.clearTimeout(id);
  }, [load]);

  async function handleDelete(venue: Venue) {
    if (!confirm(`¿Eliminar el venue "${venue.name}"? Esta acción no se puede deshacer.`)) return;
    setDeletingId(venue.id);
    try {
      const res = await fetch(`/api/venues/${venue.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo eliminar el venue");
        return;
      }
      setVenues((prev) => prev.filter((v) => v.id !== venue.id));
      toast.success("Venue eliminado");
    } catch {
      toast.error("No se pudo eliminar el venue");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Venues</h1>
          <p className="text-muted-foreground">Lugares reutilizables para tus eventos</p>
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
            const capacityParts = [
              venue.capacityStanding != null ? `${venue.capacityStanding} parado` : null,
              venue.capacitySeated != null ? `${venue.capacitySeated} sentado` : null,
            ].filter(Boolean);

            return (
              <Card key={venue.id} className="group">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-medium">{venue.name}</p>
                      {venue.mood && <Badge variant="outline" className="text-xs">{venue.mood}</Badge>}
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
                      {venue.companyName && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {venue.companyName}
                        </span>
                      )}
                    </div>
                    {venue.description && (
                      <p className="text-sm text-muted-foreground mt-1.5">{venue.description}</p>
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
                      title="Eliminar"
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
        onSaved={load}
      />
    </div>
  );
}
