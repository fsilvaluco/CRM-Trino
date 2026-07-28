"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Sparkles } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
}

interface CandidateRow {
  include: boolean;
  title: string;
  dueDate: string;
  description: string;
  subprojectId: string;
}

export function ImportDocumentDialog({
  open,
  onClose,
  projectId,
  artistProjectId,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  artistProjectId?: string | null;
  onImported: () => void;
}) {
  const [documentText, setDocumentText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [rows, setRows] = useState<CandidateRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    if (!open || !projectId) return;
    fetch(`/api/subprojects?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => setCampaigns(Array.isArray(d) ? d : []))
      .catch(() => setCampaigns([]));
  }, [open, projectId]);

  function reset() {
    setDocumentText("");
    setRows(null);
  }

  async function handleExtract() {
    if (documentText.trim().length < 20) {
      toast.error("Pega el texto del documento primero");
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch("/api/tasks/import-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentText, projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo leer el documento");
        return;
      }
      if (!data.milestones || data.milestones.length === 0) {
        toast.error("No se encontraron hitos con fecha en el documento");
        return;
      }
      setRows(
        data.milestones.map((m: { title: string; dueDate: string | null; description: string; suggestedCampaign: string | null }) => ({
          include: true,
          title: m.title,
          dueDate: m.dueDate ?? "",
          description: m.description,
          subprojectId: campaigns.find((c) => c.name === m.suggestedCampaign)?.id ?? "",
        }))
      );
    } catch {
      toast.error("Error de red al leer el documento");
    } finally {
      setExtracting(false);
    }
  }

  function updateRow(index: number, patch: Partial<CandidateRow>) {
    setRows((prev) => (prev ? prev.map((r, i) => (i === index ? { ...r, ...patch } : r)) : prev));
  }

  async function handleCreate() {
    if (!rows) return;
    const toCreate = rows.filter((r) => r.include && r.title.trim());
    if (toCreate.length === 0) {
      toast.error("Selecciona al menos una tarea");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/tasks/bulk-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          artistProjectId,
          tasks: toCreate.map((r) => ({
            title: r.title,
            dueDate: r.dueDate || null,
            description: r.description,
            subprojectId: r.subprojectId || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudieron crear las tareas");
        return;
      }
      toast.success(`${data.created} tareas creadas`);
      reset();
      onImported();
      onClose();
    } catch {
      toast.error("Error de red al crear las tareas");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Importar cronograma desde documento
          </DialogTitle>
          <DialogDescription>
            Pega el texto de un cronograma, contrato o plan de lanzamiento — la IA propone una tarea por
            cada fecha límite que encuentre. Revisa y edita todo antes de crear nada.
          </DialogDescription>
        </DialogHeader>

        {!rows ? (
          <div className="space-y-3">
            <Textarea
              value={documentText}
              onChange={(e) => setDocumentText(e.target.value)}
              placeholder="Pega aquí el texto completo del documento..."
              className="min-h-[240px] text-sm"
            />
            <Button onClick={handleExtract} disabled={extracting} className="cursor-pointer">
              <Sparkles className="h-4 w-4 mr-1.5" />
              {extracting ? "Leyendo documento..." : "Extraer hitos"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {rows.length} hitos encontrados — edítalos o descarta los que no correspondan.
            </p>
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex gap-2 items-start border rounded-lg p-2">
                  <Checkbox
                    checked={row.include}
                    onCheckedChange={(v) => updateRow(i, { include: Boolean(v) })}
                    className="mt-2"
                  />
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <Input
                      value={row.title}
                      onChange={(e) => updateRow(i, { title: e.target.value })}
                      className="h-8 text-sm font-medium"
                    />
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={row.dueDate}
                        onChange={(e) => updateRow(i, { dueDate: e.target.value })}
                        className="h-8 text-sm w-40"
                      />
                      <Select
                        value={row.subprojectId || "__none__"}
                        onValueChange={(v) => updateRow(i, { subprojectId: !v || v === "__none__" ? "" : v })}
                      >
                        <SelectTrigger className="h-8 text-sm flex-1 cursor-pointer">
                          <SelectValue placeholder="Sin campaña">
                          {row.subprojectId ? campaigns.find((c) => c.id === row.subprojectId)?.name ?? "Sin campaña" : "Sin campaña"}
                        </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sin campaña</SelectItem>
                          {campaigns.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Textarea
                      value={row.description}
                      onChange={(e) => updateRow(i, { description: e.target.value })}
                      className="text-xs min-h-[40px]"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRows(null)} className="cursor-pointer">
                Volver
              </Button>
              <Button onClick={handleCreate} disabled={creating} className="cursor-pointer">
                {creating ? "Creando..." : `Crear ${rows.filter((r) => r.include).length} tareas`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
