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
import { FileText, Sparkles, Link as LinkIcon, ClipboardPaste } from "lucide-react";

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
  assigneeIds: string[];
}

interface Member {
  userId: string;
  fullName: string | null;
  email: string | null;
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
  const [mode, setMode] = useState<"text" | "link">("link");
  const [documentText, setDocumentText] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [rows, setRows] = useState<CandidateRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    if (!open || !projectId) return;
    fetch(`/api/subprojects?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => setCampaigns(Array.isArray(d) ? d : []))
      .catch(() => setCampaigns([]));

    fetch(`/api/project-members?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) =>
        setMembers(
          Array.isArray(d)
            ? d.map((m: { user_id: string; profiles?: { full_name: string | null; email: string | null } }) => ({
                userId: m.user_id,
                fullName: m.profiles?.full_name ?? null,
                email: m.profiles?.email ?? null,
              }))
            : []
        )
      )
      .catch(() => setMembers([]));
  }, [open, projectId]);

  function reset() {
    setDocumentText("");
    setDocumentUrl("");
    setRows(null);
  }

  async function handleExtract() {
    if (mode === "link" && documentUrl.trim().length < 10) {
      toast.error("Pega el link del documento primero");
      return;
    }
    if (mode === "text" && documentText.trim().length < 20) {
      toast.error("Pega el texto del documento primero");
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch("/api/tasks/import-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "link" ? { documentUrl, projectId } : { documentText, projectId }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo leer el documento");
        return;
      }
      if (!data.milestones || data.milestones.length === 0) {
        toast.error("No se encontraron hitos ni compromisos en el documento");
        return;
      }
      setRows(
        data.milestones.map(
          (m: {
            title: string;
            dueDate: string | null;
            description: string;
            suggestedCampaign: string | null;
            assigneeName: string | null;
          }) => {
            const matchedMember = m.assigneeName
              ? members.find(
                  (mem) =>
                    mem.fullName?.toLowerCase() === m.assigneeName?.toLowerCase() ||
                    mem.email?.toLowerCase() === m.assigneeName?.toLowerCase()
                )
              : undefined;
            return {
              include: true,
              title: m.title,
              dueDate: m.dueDate ?? "",
              description: m.description,
              subprojectId: campaigns.find((c) => c.name === m.suggestedCampaign)?.id ?? "",
              assigneeIds: matchedMember ? [matchedMember.userId] : [],
            };
          }
        )
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
            assigneeIds: r.assigneeIds,
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
      <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Importar cronograma desde documento
          </DialogTitle>
          <DialogDescription>
            Pega el link de un doc de Google (ej. notas de Gemini de una reunión) o el texto de un
            cronograma/contrato — la IA propone una tarea por cada compromiso o fecha límite que
            encuentre. Revisa y edita todo antes de crear nada.
          </DialogDescription>
        </DialogHeader>

        {!rows ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "link" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("link")}
                className="cursor-pointer"
              >
                <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
                Link
              </Button>
              <Button
                type="button"
                variant={mode === "text" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("text")}
                className="cursor-pointer"
              >
                <ClipboardPaste className="h-3.5 w-3.5 mr-1.5" />
                Pegar texto
              </Button>
            </div>

            {mode === "link" ? (
              <div className="space-y-1.5">
                <Input
                  value={documentUrl}
                  onChange={(e) => setDocumentUrl(e.target.value)}
                  placeholder="https://docs.google.com/document/d/..."
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Por ahora solo links de Google Docs, y el doc debe estar compartido como
                  &quot;Cualquier persona con el link&quot;. Si no, pega el texto en la otra pestaña.
                </p>
              </div>
            ) : (
              <Textarea
                value={documentText}
                onChange={(e) => setDocumentText(e.target.value)}
                placeholder="Pega aquí el texto completo del documento..."
                className="min-h-[240px] text-sm"
              />
            )}

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
                <div key={i} className="flex gap-3 items-start border rounded-lg p-3">
                  <Checkbox
                    checked={row.include}
                    onCheckedChange={(v) => updateRow(i, { include: Boolean(v) })}
                    className="mt-2.5"
                  />
                  <div className="flex-1 space-y-2 min-w-0">
                    <Input
                      value={row.title}
                      onChange={(e) => updateRow(i, { title: e.target.value })}
                      className="h-9 text-sm font-medium"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        type="date"
                        value={row.dueDate}
                        onChange={(e) => updateRow(i, { dueDate: e.target.value })}
                        className="h-9 text-sm"
                      />
                      <Select
                        value={row.subprojectId || "__none__"}
                        onValueChange={(v) => updateRow(i, { subprojectId: !v || v === "__none__" ? "" : v })}
                      >
                        <SelectTrigger className="h-9 text-sm cursor-pointer">
                          <SelectValue placeholder="Sin campaña">
                          <span className="truncate">{row.subprojectId ? campaigns.find((c) => c.id === row.subprojectId)?.name ?? "Sin campaña" : "Sin campaña"}</span>
                        </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sin campaña</SelectItem>
                          {campaigns.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={row.assigneeIds[0] || "__none__"}
                        onValueChange={(v) =>
                          updateRow(i, { assigneeIds: !v || v === "__none__" ? [] : [v] })
                        }
                      >
                        <SelectTrigger className="h-9 text-sm cursor-pointer">
                          <SelectValue placeholder="Sin responsable">
                            <span className="truncate">
                              {row.assigneeIds[0]
                                ? (() => {
                                    const m = members.find((mm) => mm.userId === row.assigneeIds[0]);
                                    return m?.fullName || m?.email || "Sin responsable";
                                  })()
                                : "Sin responsable"}
                            </span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sin responsable</SelectItem>
                          {members.map((m) => (
                            <SelectItem key={m.userId} value={m.userId}>
                              {m.fullName || m.email || m.userId}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Textarea
                      value={row.description}
                      onChange={(e) => updateRow(i, { description: e.target.value })}
                      className="text-xs min-h-[48px]"
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
