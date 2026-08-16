"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SMARTLINK_PLATFORMS, getPlatformDef } from "@/lib/smartlink-platforms";
import { PlatformIcon } from "./PlatformIcon";

export interface SmartlinkLinkItem {
  id: string;
  platform: string;
  url: string;
  label: string | null;
}

export interface SmartlinkItem {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  artistName: string | null;
  coverImageUrl: string | null;
  links: SmartlinkLinkItem[];
  viewCount: number;
  clickCount: number;
  createdAt: string;
  updatedAt: string;
}

interface DraftLink {
  platform: string;
  url: string;
  label: string;
}

const EMPTY_LINK: DraftLink = { platform: "spotify", url: "", label: "" };

export function SmartlinkFormDialog({
  open,
  onClose,
  onSaved,
  projectId,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  projectId: string | null;
  editing: SmartlinkItem | null;
}) {
  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [links, setLinks] = useState<DraftLink[]>([{ ...EMPTY_LINK }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setArtistName(editing?.artistName ?? "");
    setCoverImageUrl(editing?.coverImageUrl ?? "");
    setCustomSlug("");
    setLinks(
      editing && editing.links.length > 0
        ? editing.links.map((l) => ({ platform: l.platform, url: l.url, label: l.label ?? "" }))
        : [{ ...EMPTY_LINK }]
    );
  }, [open, editing]);

  function updateLink(index: number, patch: Partial<DraftLink>) {
    setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLink() {
    setLinks((prev) => [...prev, { ...EMPTY_LINK }]);
  }

  function removeLink(index: number) {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Falta el nombre de la canción/release");
      return;
    }
    const cleanLinks = links.filter((l) => l.url.trim());
    if (cleanLinks.length === 0) {
      toast.error("Agrega al menos un link de alguna plataforma");
      return;
    }
    if (!editing && !projectId) {
      toast.error("Selecciona un proyecto activo primero");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        artistName: artistName.trim(),
        coverImageUrl: coverImageUrl.trim(),
        links: cleanLinks.map((l) => ({ platform: l.platform, url: l.url.trim(), label: l.label.trim() || undefined })),
      };

      const res = editing
        ? await fetch(`/api/smartlinks/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/smartlinks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, projectId, customSlug: customSlug.trim() || undefined }),
          });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar");

      toast.success(editing ? "Smartlink actualizado" : "Smartlink creado");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Smartlink" : "Nuevo Smartlink"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sl-title">Nombre de la canción/release</Label>
              <Input id="sl-title" placeholder="¿Qué te cuesta?" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sl-artist">Artista (opcional)</Label>
              <Input id="sl-artist" placeholder="Gamuza" value={artistName} onChange={(e) => setArtistName(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sl-cover">Link de la carátula (opcional)</Label>
            <Input id="sl-cover" placeholder="https://..." value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Pega la URL de una imagen ya subida (ej. la misma que usaste en el distribuidor). Cuadrada se ve mejor.
            </p>
          </div>

          {!editing && (
            <div className="space-y-2">
              <Label htmlFor="sl-slug">Link corto personalizado (opcional)</Label>
              <Input id="sl-slug" placeholder="ej. que-te-cuesta" value={customSlug} onChange={(e) => setCustomSlug(e.target.value)} />
              <p className="text-xs text-muted-foreground">Vacío = se genera uno random. Una vez creado no se puede cambiar.</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Links por plataforma</Label>
            <div className="space-y-2">
              {links.map((link, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={link.platform} onValueChange={(v) => updateLink(i, { platform: v ?? "spotify" })}>
                    <SelectTrigger className="cursor-pointer w-40 shrink-0">
                      <SelectValue>
                        <span className="flex items-center gap-1.5">
                          <PlatformIcon platformKey={link.platform} size={14} />
                          {getPlatformDef(link.platform).label}
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {SMARTLINK_PLATFORMS.map((p) => (
                        <SelectItem key={p.key} value={p.key}>
                          <span className="flex items-center gap-1.5">
                            <PlatformIcon platformKey={p.key} size={14} />
                            {p.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {link.platform === "other" && (
                    <Input
                      placeholder="Nombre"
                      value={link.label}
                      onChange={(e) => updateLink(i, { label: e.target.value })}
                      className="w-24 shrink-0"
                    />
                  )}
                  <Input
                    placeholder="https://..."
                    value={link.url}
                    onChange={(e) => updateLink(i, { url: e.target.value })}
                    className="flex-1"
                  />
                  <button
                    onClick={() => removeLink(i)}
                    className="text-muted-foreground hover:text-destructive cursor-pointer p-1 shrink-0"
                    title="Quitar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" className="cursor-pointer" onClick={addLink}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Agregar plataforma
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="cursor-pointer">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="cursor-pointer">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {editing ? "Guardar" : "Crear Smartlink"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
