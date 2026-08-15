"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { QrFormDialog, type QrCodeItem } from "@/components/qr/QrFormDialog";
import { QrImage, generateQrDataUrl } from "@/components/qr/QrImage";
import { useProject } from "@/lib/project-context";
import { toast } from "sonner";
import { QrCode, Plus, Pencil, Trash2, Copy, Download, ScanLine } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export default function QrCodesPage() {
  const { activeProject } = useProject();
  const [items, setItems] = useState<QrCodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<QrCodeItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!activeProject?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/qr?projectId=${activeProject.id}`)
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [activeProject?.id]);

  useEffect(() => {
    load();
  }, [load]);

  function shortUrl(slug: string) {
    return `${window.location.origin}/q/${slug}`;
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

  async function handleDownload(item: QrCodeItem) {
    try {
      const dataUrl = await generateQrDataUrl(shortUrl(item.slug));
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `qr-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      a.click();
    } catch {
      toast.error("No se pudo generar la imagen");
    }
  }

  async function handleDelete(item: QrCodeItem) {
    if (!confirm(`¿Eliminar el QR "${item.label}"? Si ya está impreso o pegado en algún lado, dejará de funcionar. Esta acción no se puede deshacer.`)) return;
    setDeletingId(item.id);
    try {
      const res = await fetch(`/api/qr/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("QR eliminado");
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
        icon={QrCode}
        title="Elige un proyecto"
        description="Los códigos QR son por proyecto -- selecciona uno arriba para ver o crear los suyos."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Códigos QR</h1>
          <p className="text-muted-foreground">
            Cada QR redirige a un link real y cuenta cuántas veces lo escanean -- crea varios apuntando
            al mismo destino para saber cuál funciona mejor (ej. flyer vs. bio de Instagram).
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="cursor-pointer">
          <Plus className="h-4 w-4 mr-1.5" />
          Nuevo QR
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={QrCode}
          title="Sin códigos QR todavía"
          description="Crea el primero para un flyer, la bio de Instagram, o cualquier link que quieras trackear."
          actionLabel="Nuevo QR"
          onAction={() => { setEditing(null); setFormOpen(true); }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex gap-3">
                  <QrImage url={shortUrl(item.slug)} size={80} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium truncate" title={item.label}>{item.label}</p>
                    <button
                      onClick={() => handleCopy(item.slug)}
                      className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer"
                      title="Copiar link corto"
                    >
                      <Copy className="h-3 w-3 shrink-0" />
                      <span className="truncate">/q/{item.slug}</span>
                    </button>
                    <p className="text-xs text-muted-foreground truncate" title={item.destinationUrl}>
                      → {item.destinationUrl}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                  <Badge variant="secondary" className="text-xs">
                    <ScanLine className="h-3 w-3 mr-1" />
                    {item.scanCount} escaneo{item.scanCount === 1 ? "" : "s"}
                  </Badge>
                  {item.lastScannedAt && (
                    <span>último {formatDistanceToNow(new Date(item.lastScannedAt), { addSuffix: true, locale: es })}</span>
                  )}
                </div>

                <div className="flex items-center gap-1 pt-1">
                  <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer flex-1" onClick={() => handleDownload(item)}>
                    <Download className="h-3.5 w-3.5 mr-1" />
                    PNG
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

      <QrFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={load}
        projectId={activeProject.id}
        editing={editing}
      />
    </div>
  );
}
