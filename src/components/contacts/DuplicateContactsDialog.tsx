"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Users } from "lucide-react";

interface DuplicateContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  projectName: string | null;
  artistProjectName: string | null;
  companyName: string | null;
  createdAt: string;
}

interface DuplicateGroup {
  matchType: "email" | "phone";
  matchValue: string;
  contacts: DuplicateContact[];
}

interface DuplicateContactsDialogProps {
  open: boolean;
  onClose: () => void;
  onMerged: () => void;
  projectId?: string;
}

export function DuplicateContactsDialog({ open, onClose, onMerged, projectId }: DuplicateContactsDialogProps) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  // Por grupo (indexado por matchValue): id del contacto principal + set de ids marcados para fusionar
  const [primaryByGroup, setPrimaryByGroup] = useState<Record<string, string>>({});
  const [checkedByGroup, setCheckedByGroup] = useState<Record<string, Set<string>>>({});
  const [mergingGroup, setMergingGroup] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = `?projectId=${projectId}`;
      const res = await fetch(`/api/contacts/duplicates${params}`);
      const data = await res.json();
      const loadedGroups: DuplicateGroup[] = data.groups ?? [];
      setGroups(loadedGroups);

      const primaries: Record<string, string> = {};
      const checked: Record<string, Set<string>> = {};
      for (const g of loadedGroups) {
        // El mas antiguo (primero, ya viene ordenado asc) queda como principal por defecto
        primaries[g.matchValue] = g.contacts[0].id;
        checked[g.matchValue] = new Set(g.contacts.slice(1).map((c) => c.id));
      }
      setPrimaryByGroup(primaries);
      setCheckedByGroup(checked);
    } catch {
      toast.error("No se pudieron cargar los duplicados");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  function toggleChecked(groupKey: string, contactId: string) {
    setCheckedByGroup((prev) => {
      const next = new Set(prev[groupKey]);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return { ...prev, [groupKey]: next };
    });
  }

  function setPrimary(groupKey: string, contactId: string) {
    setPrimaryByGroup((prev) => ({ ...prev, [groupKey]: contactId }));
    // El que pasa a ser principal no puede seguir marcado como "a fusionar"
    setCheckedByGroup((prev) => {
      const next = new Set(prev[groupKey]);
      next.delete(contactId);
      return { ...prev, [groupKey]: next };
    });
  }

  async function handleMerge(group: DuplicateGroup) {
    const primaryId = primaryByGroup[group.matchValue];
    const mergeIds = Array.from(checkedByGroup[group.matchValue] ?? []);

    if (mergeIds.length === 0) {
      toast.info("No marcaste ningun contacto para fusionar en este grupo");
      return;
    }

    setMergingGroup(group.matchValue);
    try {
      const res = await fetch("/api/contacts/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryContactId: primaryId, mergeContactIds: mergeIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo fusionar");
        return;
      }
      toast.success(`Se fusionaron ${data.mergedCount} contacto(s)`);
      setGroups((prev) => prev.filter((g) => g.matchValue !== group.matchValue));
      onMerged();
    } finally {
      setMergingGroup(null);
    }
  }

  function describeContact(c: DuplicateContact) {
    const projectLabel = c.artistProjectName ?? c.projectName ?? "sin proyecto";
    const parts = [projectLabel];
    if (c.companyName) parts.push(c.companyName);
    return parts.join(" · ");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Contactos duplicados
          </DialogTitle>
          <DialogDescription>
            Encontrados por el mismo email o teléfono. Elige cuál contacto queda como principal
            (radio) y cuáles se fusionan en él (checkbox). Se combinan las notas y se mueven los
            tratos/tareas antes de archivar los duplicados.
          </DialogDescription>
        </DialogHeader>

        {!projectId ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Selecciona un proyecto (arriba a la izquierda) para buscar duplicados dentro de él.
          </p>
        ) : loading ? (
          <div className="space-y-3 py-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No se encontraron contactos duplicados por email o teléfono. 🎉
          </p>
        ) : (
          <div className="space-y-6 py-2">
            {groups.map((group) => (
              <div key={group.matchValue} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {group.matchType === "email" ? "Email" : "Teléfono"}: {group.matchValue}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {group.contacts.length} contactos
                  </span>
                </div>

                <div className="space-y-2">
                  {group.contacts.map((c) => {
                    const isPrimary = primaryByGroup[group.matchValue] === c.id;
                    const isChecked = checkedByGroup[group.matchValue]?.has(c.id) ?? false;
                    return (
                      <div
                        key={c.id}
                        className={`flex items-center gap-3 rounded-md p-2 ${
                          isPrimary ? "bg-primary/5 border border-primary/30" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name={`primary-${group.matchValue}`}
                          checked={isPrimary}
                          onChange={() => setPrimary(group.matchValue, c.id)}
                          className="cursor-pointer"
                          title="Usar como contacto principal"
                        />
                        <Checkbox
                          checked={isPrimary ? false : isChecked}
                          disabled={isPrimary}
                          onCheckedChange={() => toggleChecked(group.matchValue, c.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            {c.name} {isPrimary && <span className="text-xs text-primary">(principal)</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {c.email || c.phone} · {describeContact(c)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="cursor-pointer"
                    disabled={mergingGroup === group.matchValue}
                    onClick={() => handleMerge(group)}
                  >
                    {mergingGroup === group.matchValue ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : null}
                    Combinar seleccionados
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
