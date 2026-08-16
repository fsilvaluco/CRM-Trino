"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { SmartlinkFormDialog, type SmartlinkItem } from "@/components/smartlinks/SmartlinkFormDialog";
import { SmartlinkStatsSheet } from "@/components/smartlinks/SmartlinkStatsSheet";
import { PlatformIcon } from "@/components/smartlinks/PlatformIcon";
import { useProject } from "@/lib/project-context";
import { toast } from "sonner";
import { Link2, Plus, Pencil, Trash2, Copy, BarChart2, Music2 } from "lucide-react";

export default function SmartlinksPage() {
  const { activeProject } = useProject();
  const [items, setItems] = useState<SmartlinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SmartlinkItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewingStats, setViewingStats] = useState<SmartlinkItem | null>(null);

  const load = useCallback(() => {
    if (!activeProject?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/smartlinks?projectId=${activeProject.id}`)
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [activeProject?.id]);

  useEffect(() => {
    load();
  }, [load]);

  function shortUrl(slug: string) {
    return `${window.location.origin}/s/${slug}`;
  }

  async function handleCopy(slug: string) {
    const url = shortUrl(slug);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.info(url);
    }
  }

  async function handleDelete(item: SmartlinkItem) {
    if (!confirm(`¿Eliminar el smartlink "${item.title}"? Si ya lo compartiste en algún lado, dejará de funcionar. Esta acción no se puede deshacer.`)) return;
    setDeletingId(item.id);
    try {
      const res = await fetch(`/api/smartlinks/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Smartlink eliminado");
      load();
    } catch {
      toast.error("No se pudo eliminar");
    } finally {
      setDeletingId(null);
    }
  }

  if (!activeProject) {
    return (
      <EmptyState
        icon={Link2}
        title="Elige un proyecto"
        description="Los smartlinks son por proyecto -- selecciona uno arriba para ver o crear los suyos."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Smartlinks</h1>
          <p className="text-muted-foreground">
            Una página con un botón por plataforma (Spotify, Apple Music, etc.) para un mismo lanzamiento --
            cuenta vistas y qué plataforma toca cada quien.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="cursor-pointer">
          <Plus className="h-4 w-4 mr-1.5" />
          Nuevo Smartlink
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="Sin smartlinks todavía"
          description="Crea el primero para un lanzamiento -- un link con botones a Spotify, Apple Music, etc."
          actionLabel="Nuevo Smartlink"
          onAction={() => { setEditing(null); setFormOpen(true); }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex gap-3">
                  <div className="h-16 w-16 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                    {item.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.coverImageUrl} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <Music2 className="h-6 w-6 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium truncate" title={item.title}>{item.title}</p>
                    {item.artistName && <p className="text-xs text-muted-foreground truncate">{item.artistName}</p>}
                    <button
                      onClick={() => handleCopy(item.slug)}
                      className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer"
                      title="Copiar link"
                    >
                      <Copy className="h-3 w-3 shrink-0" />
                      <span className="truncate">/s/{item.slug}</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {item.links.slice(0, 6).map((l) => (
                    <div key={l.id} className="p-1 rounded bg-muted" title={l.platform}>
                      <PlatformIcon platformKey={l.platform} size={12} />
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setViewingStats(item)}
                  className="w-full flex items-center justify-between text-xs text-muted-foreground border-t pt-2 cursor-pointer hover:text-foreground"
                  title="Ver estadísticas"
                >
                  <Badge variant="secondary" className="text-xs">
                    <BarChart2 className="h-3 w-3 mr-1" />
                    {item.viewCount} vistas · {item.clickCount} clicks
                  </Badge>
                </button>

                <div className="flex items-center gap-1 pt-1">
                  <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer flex-1" onClick={() => window.open(shortUrl(item.slug), "_blank")}>
                    Ver página
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 cursor-pointer" onClick={() => { setEditing(item); setFormOpen(true); }} title="Editar">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 cursor-pointer text-muted-foreground hover:text-destructive"
                    disabled={deletingId === item.id}
                    onClick={() => handleDelete(item)}
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SmartlinkFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={load}
        projectId={activeProject.id}
        editing={editing}
      />
      <SmartlinkStatsSheet item={viewingStats} onClose={() => setViewingStats(null)} />
    </div>
  );
}
