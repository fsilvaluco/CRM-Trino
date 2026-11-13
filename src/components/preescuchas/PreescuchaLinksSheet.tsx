"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ClipboardList, Loader2, Plus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/shared/ConfirmProvider";
import type { PreescuchaItem } from "@/lib/preescuchas";
import { parseRecipientNames, type PreescuchaLinkItem, type PreescuchaLinksResponse } from "@/lib/preescucha-links";
import { PreescuchaLinkRow } from "./PreescuchaLinkRow";

interface ContactOption {
  id: string;
  name: string;
  company: string | null;
}

interface PreescuchaLinksSheetProps {
  item: PreescuchaItem;
  onClose: () => void;
  /** Se llama cuando cambia la cantidad de enlaces, para refrescar el listado. */
  onChanged: () => void;
}

// Panel "Enlaces por persona" de una Preescucha: crear un enlace distinto
// para cada periodista (escribiendo nombres o eligiendolos de Contactos),
// ver quien lo abrio y que escucho, y revocar uno puntual. Se monta al
// abrir, igual que el formulario.
export function PreescuchaLinksSheet({ item, onClose, onChanged }: PreescuchaLinksSheetProps) {
  const confirm = useConfirm();
  const [data, setData] = useState<PreescuchaLinksResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [names, setNames] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/preescuchas/${item.id}/links`);
      if (!res.ok) throw new Error();
      setData(await res.json());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [item.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Busqueda en Contactos del proyecto, con una pausa para no consultar en
  // cada tecla. Si el rol no tiene acceso a Contactos, queda vacio.
  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/contacts?projectId=${item.projectId}&search=${encodeURIComponent(term)}`);
        const rows = res.ok ? await res.json() : [];
        setContacts(Array.isArray(rows) ? rows.slice(0, 8).map((c) => ({ id: c.id, name: c.name, company: c.company ?? null })) : []);
      } catch {
        setContacts([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, item.projectId]);

  const urlFor = (slug: string) => `${window.location.origin}/escucha/${slug}`;

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.info(text);
    }
  }

  async function createLinks(recipients: Array<{ name: string; contactId?: string }>) {
    if (recipients.length === 0) return void toast.error("Escribe al menos un nombre");
    setCreating(true);
    try {
      const res = await fetch(`/api/preescuchas/${item.id}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "No se pudieron crear los enlaces");
      toast.success(recipients.length === 1 ? `Enlace creado para ${recipients[0].name}` : `${recipients.length} enlaces creados`);
      await load();
      onChanged();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron crear los enlaces");
      return false;
    } finally {
      setCreating(false);
    }
  }

  async function toggleRevoked(link: PreescuchaLinkItem) {
    if (!link.revoked) {
      const ok = await confirm({
        title: `¿Revocar el enlace de ${link.recipientName}?`,
        description: "Deja de funcionar de inmediato para esa persona. Los demás enlaces siguen igual y puedes volver a activarlo después.",
        confirmLabel: "Revocar enlace",
        destructive: true,
      });
      if (!ok) return;
    }
    setBusyId(link.id);
    try {
      const res = await fetch(`/api/preescuchas/${item.id}/links/${link.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revoked: !link.revoked }),
      });
      if (!res.ok) throw new Error();
      toast.success(link.revoked ? "Enlace activado de nuevo" : "Enlace revocado");
      await load();
    } catch {
      toast.error("No se pudo actualizar el enlace");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(link: PreescuchaLinkItem) {
    const ok = await confirm({
      title: `¿Eliminar el enlace de ${link.recipientName}?`,
      description: "Deja de funcionar y desaparece de esta lista. Lo que ya escuchó pasa a contarse en el enlace general.",
      confirmLabel: "Eliminar enlace",
      destructive: true,
    });
    if (!ok) return;
    setBusyId(link.id);
    try {
      const res = await fetch(`/api/preescuchas/${item.id}/links/${link.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Enlace eliminado");
      await load();
      onChanged();
    } catch {
      toast.error("No se pudo eliminar el enlace");
    } finally {
      setBusyId(null);
    }
  }

  const links = data?.links ?? [];
  const active = links.filter((l) => !l.revoked);
  const openedCount = active.filter((l) => l.viewCount > 0 || l.playCount > 0).length;
  const usedContactIds = new Set(links.map((l) => l.contactId).filter(Boolean));
  const tracks = item.tracks.map((t) => ({ id: t.id, title: t.title }));
  const showContacts = search.trim().length >= 2;

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Enlaces por persona
          </SheetTitle>
          <SheetDescription>
            {item.title}. Crea un enlace distinto para cada persona y sabrás quién lo abrió y qué canciones escuchó.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6 space-y-5">
          {!item.expired && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="space-y-1.5">
                <Label htmlFor="pre-link-names">Nombres (uno por línea)</Label>
                <Textarea
                  id="pre-link-names"
                  rows={3}
                  placeholder={"María Pérez (Radio Uno)\nJuan Soto (El Diario)"}
                  value={names}
                  onChange={(e) => setNames(e.target.value)}
                  disabled={creating}
                />
                <Button
                  size="sm"
                  className="cursor-pointer"
                  disabled={creating || !names.trim()}
                  onClick={async () => {
                    const created = await createLinks(parseRecipientNames(names).map((name) => ({ name })));
                    if (created) setNames("");
                  }}
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                  Crear enlaces
                </Button>
              </div>

              <div className="space-y-1.5 border-t pt-3">
                <Label htmlFor="pre-link-contact">O elige desde Contactos</Label>
                <Input id="pre-link-contact" placeholder="Buscar por nombre o correo…" value={search} onChange={(e) => setSearch(e.target.value)} />
                {showContacts && (
                  <ul className="space-y-1">
                    {searching && contacts.length === 0 && <li className="text-xs text-muted-foreground">Buscando…</li>}
                    {!searching && contacts.length === 0 && <li className="text-xs text-muted-foreground">Sin resultados en los contactos de este proyecto.</li>}
                    {contacts.map((c) => {
                      const used = usedContactIds.has(c.id);
                      return (
                        <li key={c.id} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 min-w-0 truncate">
                            {c.name}
                            {c.company && <span className="text-muted-foreground"> · {c.company}</span>}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs cursor-pointer"
                            disabled={creating || used}
                            onClick={() => createLinks([{ name: c.company ? `${c.name} (${c.company})` : c.name, contactId: c.id }])}
                          >
                            <UserPlus className="h-3.5 w-3.5 mr-1" />
                            {used ? "Ya tiene enlace" : "Crear enlace"}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          {loadError ? (
            <p className="text-sm text-destructive">
              No se pudieron cargar los enlaces.{" "}
              <button type="button" className="underline cursor-pointer" onClick={() => void load()}>Reintentar</button>
            </p>
          ) : !data ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {links.length === 0 ? "Aún no hay enlaces individuales" : `${openedCount} de ${active.length} ya lo abrieron`}
                </p>
                {active.length > 0 && !item.expired && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs cursor-pointer"
                    onClick={() => copy(active.map((l) => `${l.recipientName}: ${urlFor(l.slug)}`).join("\n"), "Lista de enlaces copiada")}
                  >
                    <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
                    Copiar todos
                  </Button>
                )}
              </div>

              <ul className="space-y-1.5">
                {links.map((link) => (
                  <PreescuchaLinkRow
                    key={link.id}
                    name={link.recipientName}
                    viewCount={link.viewCount}
                    playCount={link.playCount}
                    downloadCount={link.downloadCount}
                    lastActivityAt={link.lastActivityAt}
                    trackPlays={link.trackPlays}
                    tracks={tracks}
                    revoked={link.revoked}
                    busy={busyId === link.id}
                    onCopy={!item.expired && !link.revoked ? () => copy(urlFor(link.slug), `Enlace de ${link.recipientName} copiado`) : undefined}
                    onToggleRevoked={!item.expired ? () => toggleRevoked(link) : undefined}
                    onDelete={() => remove(link)}
                  />
                ))}
                <PreescuchaLinkRow
                  name="Enlace general"
                  subtitle="Sin persona asociada"
                  viewCount={data.general.viewCount}
                  playCount={data.general.playCount}
                  downloadCount={data.general.downloadCount}
                  trackPlays={data.general.trackPlays}
                  tracks={tracks}
                  onCopy={!item.expired ? () => copy(urlFor(item.slug), "Enlace general copiado") : undefined}
                />
              </ul>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
