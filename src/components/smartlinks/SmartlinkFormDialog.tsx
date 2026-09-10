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
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { SMARTLINK_PLATFORMS, getPlatformDef } from "@/lib/smartlink-platforms";
import { PlatformIcon } from "./PlatformIcon";

export type SmartlinkPurpose = "rrss" | "ventas";

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
  purpose: SmartlinkPurpose;
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

const PURPOSE_OPTIONS: { value: SmartlinkPurpose; label: string; description: string }[] = [
  { value: "rrss", label: "RRSS / lanzamiento", description: "Pocos botones -- lo que se está empujando ahora (último video, Spotify, canal, merch)." },
  { value: "ventas", label: "Ventas", description: "Para el correo de cierre -- todos los links de interés (redes, streaming, merch, etc.)." },
];

// Set inicial de filas al crear un smartlink nuevo, según su proposito --
// ahorra tener que agregar cada plataforma a mano. Solo se aplica una vez,
// al abrir el formulario para CREAR (nunca pisa lo que ya tiene uno existente).
const PURPOSE_PRESETS: Record<SmartlinkPurpose, DraftLink[]> = {
  rrss: [
    { platform: "youtube", url: "", label: "Último video" },
    { platform: "spotify", url: "", label: "" },
    { platform: "youtube", url: "", label: "Canal de YouTube" },
    { platform: "merch", url: "", label: "" },
  ],
  ventas: [
    { platform: "instagram", url: "", label: "" },
    { platform: "tiktok", url: "", label: "" },
    { platform: "spotify", url: "", label: "" },
    { platform: "youtube", url: "", label: "" },
    { platform: "merch", url: "", label: "" },
  ],
};

// Plataformas del smartlink que tienen equivalente directo en los "links
// guardados" del proyecto (social_links, ver SocialLinkField) -- para el
// botón de autocompletar.
const AUTOFILL_PLATFORM_KEYS = ["spotify", "instagram", "tiktok", "youtube"] as const;

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
  const [purpose, setPurpose] = useState<SmartlinkPurpose>("ventas");
  const [links, setLinks] = useState<DraftLink[]>([{ ...EMPTY_LINK }]);
  const [saving, setSaving] = useState(false);
  const [autofilling, setAutofilling] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setArtistName(editing?.artistName ?? "");
    setCoverImageUrl(editing?.coverImageUrl ?? "");
    setCustomSlug("");
    setPurpose(editing?.purpose ?? "ventas");
    setLinks(
      editing && editing.links.length > 0
        ? editing.links.map((l) => ({ platform: l.platform, url: l.url, label: l.label ?? "" }))
        : editing
        ? [{ ...EMPTY_LINK }]
        : PURPOSE_PRESETS.ventas.map((l) => ({ ...l }))
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

  // Cambiar el proposito de un smartlink NUEVO reemplaza el set de filas
  // por el preset correspondiente -- pero solo si todavia no se escribio
  // ninguna URL, para no botar trabajo ya hecho. Editando uno existente el
  // proposito es solo una etiqueta -- no toca los links.
  function handlePurposeChange(next: SmartlinkPurpose) {
    setPurpose(next);
    if (editing) return;
    const untouched = links.every((l) => !l.url.trim());
    if (untouched) setLinks(PURPOSE_PRESETS[next].map((l) => ({ ...l })));
  }

  // Trae los links de perfil ya guardados en el proyecto (social_links --
  // los que se van dejando en cada submenu de Métricas) y rellena las filas
  // vacías que calcen por plataforma. No pisa una URL que ya se escribió.
  async function handleAutofill() {
    if (!projectId) return;
    setAutofilling(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const saved = (data?.socialLinks ?? {}) as Record<string, string>;
      const available = AUTOFILL_PLATFORM_KEYS.filter((k) => saved[k]?.trim());
      if (available.length === 0) {
        toast.info("Este proyecto todavía no tiene links guardados en Métricas");
        return;
      }
      setLinks((prev) => {
        const next = [...prev];
        let filledAny = false;
        for (const key of available) {
          const emptySlot = next.find((l) => l.platform === key && !l.url.trim());
          if (emptySlot) {
            emptySlot.url = saved[key];
          } else if (!next.some((l) => l.platform === key && l.url.trim() === saved[key].trim())) {
            next.push({ platform: key, url: saved[key], label: "" });
          } else {
            continue;
          }
          filledAny = true;
        }
        return filledAny ? next : prev;
      });
      toast.success("Links rellenados desde el proyecto");
    } catch {
      toast.error("No se pudieron traer los links guardados");
    } finally {
      setAutofilling(false);
    }
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
        purpose,
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
            <Label>Para qué es este smartlink</Label>
            <Select value={purpose} onValueChange={(v) => handlePurposeChange(v === "rrss" ? "rrss" : "ventas")}>
              <SelectTrigger className="cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PURPOSE_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {PURPOSE_OPTIONS.find((p) => p.value === purpose)?.description}
            </p>
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
            <div className="flex items-center justify-between">
              <Label>Links por plataforma</Label>
              {projectId && (
                <button
                  type="button"
                  onClick={handleAutofill}
                  disabled={autofilling}
                  className="text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Rellena con los links de perfil ya guardados en Métricas del proyecto"
                >
                  {autofilling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                  Rellenar desde el proyecto
                </button>
              )}
            </div>
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
                  <Input
                    placeholder={link.platform === "other" || link.platform === "merch" ? "Nombre" : "Nombre del botón (opcional)"}
                    value={link.label}
                    onChange={(e) => updateLink(i, { label: e.target.value })}
                    className="w-28 shrink-0"
                    title="Ej. 'Último video' para distinguirlo de otro botón de la misma plataforma"
                  />
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
