"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { PreescuchaFormDialog } from "@/components/preescuchas/PreescuchaFormDialog";
import { useConfirm } from "@/components/shared/ConfirmProvider";
import { useProject } from "@/lib/project-context";
import type { PreescuchaItem } from "@/lib/preescuchas";
import { daysUntil, formatDuration } from "@/lib/preescucha-format";
import { toast } from "sonner";
import { Copy, Download, Eye, Headphones, Music2, Pencil, Play, Plus, Trash2 } from "lucide-react";

function expiryLabel(item: PreescuchaItem): string {
  if (item.expired) return "Vencida · archivos eliminados";
  const days = daysUntil(item.expiresAt);
  if (days === 0) return "Vence hoy";
  return days === 1 ? "Queda 1 día" : `Quedan ${days} días`;
}

export default function PreescuchasPage() {
  const { activeProject } = useProject();
  const confirm = useConfirm();
  const [items, setItems] = useState<PreescuchaItem[]>([]);
  const [loading, setLoading] = useState(true);
  // undefined = formulario cerrado · null = crear · item = editar
  const [formTarget, setFormTarget] = useState<PreescuchaItem | null | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!activeProject?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/preescuchas?projectId=${activeProject.id}`)
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [activeProject?.id]);

  useEffect(() => {
    load();
  }, [load]);

  function publicUrl(slug: string) {
    return `${window.location.origin}/escucha/${slug}`;
  }

  async function handleCopy(slug: string) {
    const url = publicUrl(slug);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado");
    } catch {
      toast.info(url);
    }
  }

  async function handleDelete(item: PreescuchaItem) {
    const accepted = await confirm(
      item.expired
        ? {
            title: `¿Quitar "${item.title}" del historial?`,
            description: "Se pierden también sus estadísticas.",
            confirmLabel: "Quitar del historial",
            destructive: true,
          }
        : {
            title: `¿Eliminar "${item.title}" ahora?`,
            description: "Se borran los audios y el enlace deja de funcionar de inmediato para quienes ya lo tienen. Esta acción no se puede deshacer.",
            confirmLabel: "Eliminar preescucha",
            destructive: true,
          }
    );
    if (!accepted) return;
    setDeletingId(item.id);
    try {
      const res = await fetch(`/api/preescuchas/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Preescucha eliminada");
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
        icon={Headphones}
        title="Elige un proyecto"
        description="Las preescuchas son por proyecto: selecciona uno arriba para ver o crear las suyas."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight">Preescuchas</h1>
          <p className="text-muted-foreground">
            Un enlace privado para que prensa o invitados escuchen un lanzamiento antes de que salga en plataformas.
            Cada preescucha dura como máximo 30 días: al vencer, el enlace deja de funcionar y los archivos se
            eliminan solos.
          </p>
        </div>
        <Button onClick={() => setFormTarget(null)} className="cursor-pointer">
          <Plus className="h-4 w-4 mr-1.5" />
          Nueva preescucha
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-64 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Headphones}
          title="Sin preescuchas todavía"
          description="Sube las canciones de un lanzamiento y comparte el enlace con quien quieras que lo escuche antes."
          actionLabel="Nueva preescucha"
          onAction={() => setFormTarget(null)}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {items.map((item) => {
            const plays = item.tracks.reduce((sum, t) => sum + t.playCount, 0);
            const downloads = item.tracks.reduce((sum, t) => sum + t.downloadCount, 0);
            const expiringSoon = !item.expired && daysUntil(item.expiresAt) <= 3;
            return (
              <Card key={item.id} className={item.expired ? "opacity-70" : undefined}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex gap-3">
                    <div className="h-16 w-16 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                      {item.hasCover && !item.expired ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/public/preescuchas/${item.slug}/cover?v=${encodeURIComponent(item.updatedAt)}`}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music2 className="h-6 w-6 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium truncate" title={item.title}>{item.title}</p>
                      {item.artistName && <p className="text-xs text-muted-foreground truncate">{item.artistName}</p>}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={item.expired ? "outline" : expiringSoon ? "destructive" : "secondary"} className="text-[10px] px-1.5 py-0">
                          {expiryLabel(item)}
                        </Badge>
                        {item.allowDownload && !item.expired && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">Descarga habilitada</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {item.expired ? "Venció" : "Se elimina"} el {format(new Date(item.expiresAt), "d 'de' MMMM", { locale: es })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground border-y py-2">
                    <span className="flex items-center gap-1" title="Veces que se abrió el enlace"><Eye className="h-3.5 w-3.5" /> {item.viewCount} visitas</span>
                    <span className="flex items-center gap-1" title="Canciones reproducidas"><Play className="h-3.5 w-3.5" /> {plays} reproducciones</span>
                    {(item.allowDownload || downloads > 0) && (
                      <span className="flex items-center gap-1"><Download className="h-3.5 w-3.5" /> {downloads} descargas</span>
                    )}
                  </div>

                  <ol className="space-y-0.5 max-h-40 overflow-y-auto text-xs">
                    {item.tracks.map((t, i) => (
                      <li key={t.id} className="flex items-center gap-2 py-0.5">
                        <span className="w-4 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                        <span className="flex-1 truncate">{t.title}</span>
                        <span className="text-muted-foreground tabular-nums">{formatDuration(t.durationSeconds)}</span>
                        <span className="w-10 text-right text-muted-foreground tabular-nums flex items-center justify-end gap-0.5" title="Reproducciones">
                          <Play className="h-2.5 w-2.5" /> {t.playCount}
                        </span>
                      </li>
                    ))}
                  </ol>

                  <div className="flex items-center gap-1 pt-1">
                    {!item.expired && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer flex-1" onClick={() => handleCopy(item.slug)}>
                          <Copy className="h-3.5 w-3.5 mr-1.5" />
                          Copiar enlace
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" onClick={() => window.open(publicUrl(item.slug), "_blank")}>
                          Ver página
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 cursor-pointer" onClick={() => setFormTarget(item)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 cursor-pointer text-muted-foreground hover:text-destructive ml-auto"
                      disabled={deletingId === item.id}
                      onClick={() => handleDelete(item)}
                      title={item.expired ? "Quitar del historial" : "Eliminar ahora"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {formTarget !== undefined && (
        <PreescuchaFormDialog
          key={formTarget?.id ?? "nueva"}
          projectId={activeProject.id}
          defaultArtistName={activeProject.name}
          editing={formTarget}
          onClose={() => setFormTarget(undefined)}
          onSaved={load}
        />
      )}
    </div>
  );
}
