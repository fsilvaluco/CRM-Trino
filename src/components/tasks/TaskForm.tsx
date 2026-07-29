"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useProject } from "@/lib/project-context";
import { AssigneeSelector } from "@/components/shared/AssigneeSelector";

const taskSchema = z.object({
  title: z.string().min(1, "El titulo es requerido"),
  description: z.string(),
  priority: z.enum(["low", "medium", "high"]),
  dueDate: z.string(),
  projectId: z.string().min(1, "El proyecto es requerido"),
  artistProjectId: z.string(),
  contactId: z.string(),
  companyId: z.string(),
  dealId: z.string(),
  subprojectId: z.string(),
});

type TaskFormData = z.infer<typeof taskSchema>;

interface TaskFormProps {
  open: boolean;
  onClose: () => void;
  preselectedContactId?: string;
  preselectedDealId?: string;
  preselectedCompanyId?: string;
  preselectedProjectId?: string;
  preselectedSubprojectId?: string;
  prefillTitle?: string;
  prefillDescription?: string;
  prefillDueDate?: string;
}

export function TaskForm({
  open,
  onClose,
  preselectedContactId,
  preselectedDealId,
  preselectedCompanyId,
  preselectedProjectId,
  preselectedSubprojectId,
  prefillTitle,
  prefillDescription,
  prefillDueDate,
}: TaskFormProps) {
  const { activeProject, projects } = useProject();
  const [contactsList, setContacts] = useState<Array<{ id: string; name: string }>>([]);
  const [dealsList, setDeals] = useState<Array<{ id: string; title: string }>>([]);
  const [companiesList, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [subprojectsList, setSubprojects] = useState<Array<{ id: string; name: string }>>([]);
  const [artistProjects, setArtistProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [orgMembers, setOrgMembers] = useState<Array<{ user_id: string; profiles: { full_name: string | null; email: string | null; avatar_url: string | null } }>>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: prefillTitle || "",
      description: prefillDescription || "",
      priority: "medium",
      dueDate: prefillDueDate || "",
      projectId: preselectedProjectId || activeProject?.id || "",
      artistProjectId: "",
      contactId: preselectedContactId || "",
      companyId: preselectedCompanyId || "",
      dealId: preselectedDealId || "",
      subprojectId: preselectedSubprojectId || "",
    },
  });

  const selectedProjectId = watch("projectId");
  const hasActiveProject = Boolean(activeProject?.id);

  useEffect(() => {
    if (!open) return;

    const forcedProjectId = activeProject?.id || preselectedProjectId || "";
    setValue("projectId", forcedProjectId);
    if (!forcedProjectId) {
      setValue("subprojectId", "");
    }
  }, [open, activeProject?.id, preselectedProjectId, setValue]);

  // Aplica el prefill (titulo/descripcion/fecha) cada vez que el modal se
  // abre. Depende solo de valores primitivos -- nunca de un objeto -- para
  // evitar que un re-render con un objeto "igual pero nuevo" dispare un
  // reset que borre lo que el usuario ya escribio (mismo bug que tuvimos
  // en DealForm).
  useEffect(() => {
    if (!open) return;
    reset({
      title: prefillTitle || "",
      description: prefillDescription || "",
      priority: "medium",
      dueDate: prefillDueDate || "",
      projectId: preselectedProjectId || activeProject?.id || "",
      artistProjectId: "",
      contactId: preselectedContactId || "",
      companyId: preselectedCompanyId || "",
      dealId: preselectedDealId || "",
      subprojectId: preselectedSubprojectId || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillTitle, prefillDescription, prefillDueDate]);

  useEffect(() => {
    if (!open) return;
    const effectiveProjectId = selectedProjectId || activeProject?.id || "";
    const projectParam = effectiveProjectId ? `?projectId=${effectiveProjectId}` : "";
    if (!preselectedContactId) {
      fetch(`/api/contacts${projectParam}`).then((r) => r.json()).then((d) => setContacts(Array.isArray(d) ? d : [])).catch(() => {});
    }
    if (!preselectedDealId) {
      fetch(`/api/deals${projectParam}`).then((r) => r.json()).then((d) => setDeals(Array.isArray(d) ? d : [])).catch(() => {});
    }
    if (!preselectedCompanyId) {
      fetch(`/api/companies${projectParam}`).then((r) => r.json()).then((d) => setCompanies(Array.isArray(d) ? d : [])).catch(() => {});
    }
    // Cargar subproyectos del proyecto activo
    if (effectiveProjectId) {
      fetch(`/api/subprojects?projectId=${effectiveProjectId}`)
        .then((r) => r.json())
        .then((d) => setSubprojects(Array.isArray(d) ? d : []))
        .catch(() => {});
      // Si el proyecto es un sello con artistas debajo, ofrece anclar la
      // tarea a un artista puntual (igual patron que en Deals).
      fetch(`/api/projects?parentId=${effectiveProjectId}`)
        .then((r) => r.json())
        .then((d) => setArtistProjects(Array.isArray(d) ? d : []))
        .catch(() => setArtistProjects([]));
    } else {
      setSubprojects([]);
      setValue("subprojectId", "");
      setArtistProjects([]);
    }
    // Cargar miembros del proyecto activo (solo usuarios asignados al proyecto)
    if (effectiveProjectId) {
      fetch(`/api/project-members?projectId=${effectiveProjectId}`)
        .then((r) => r.json())
        .then((d) => setOrgMembers(Array.isArray(d) ? d : []))
        .catch(() => {});
    } else {
      setOrgMembers([]);
    }
  }, [
    open,
    activeProject?.id,
    selectedProjectId,
    preselectedContactId,
    preselectedDealId,
    preselectedCompanyId,
    setValue,
  ]);

  const onSubmit = async (data: TaskFormData) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title,
          description: data.description || null,
          priority: data.priority,
          dueDate: data.dueDate || null,
          contactId: data.contactId || null,
          companyId: data.companyId || null,
          dealId: data.dealId || null,
          projectId: data.projectId || null,
          artistProjectId: data.artistProjectId || null,
          subprojectId: data.subprojectId || null,
          assigneeIds: selectedAssignees.length > 0 ? selectedAssignees : null,
        }),
      });

      if (!res.ok) throw new Error("Error al crear tarea");

      toast.success("Tarea creada");
      reset();
      setSelectedAssignees([]);
      onClose();
    } catch {
      toast.error("Error al crear la tarea");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Nueva Tarea</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex max-h-[calc(90vh-5rem)] min-h-0 flex-col">
          <div className="flex-1 min-h-0 space-y-4 overflow-y-auto pr-2">
          <div className="space-y-2">
            <Label htmlFor="task-title">Titulo *</Label>
            <Input
              id="task-title"
              {...register("title")}
              placeholder="Que hay que hacer?"
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-desc">Descripcion</Label>
            <Textarea
              id="task-desc"
              {...register("description")}
              placeholder="Detalles opcionales..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Select
                value={watch("priority")}
                onValueChange={(v) =>
                  v && setValue("priority", v as TaskFormData["priority"])
                }
              >
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baja</SelectItem>
                  <SelectItem value="medium">Media</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Fecha limite</Label>
              <Input type="date" {...register("dueDate")} />
            </div>
          </div>

          {/* Relaciones opcionales */}
          <div className="space-y-2">
            <Label>Proyecto</Label>
            <Select
              value={selectedProjectId || ""}
              onValueChange={(v) => {
                if (!v) return;
                setValue("projectId", v);
                setValue("subprojectId", "");
              }}
              disabled={hasActiveProject}
            >
              <SelectTrigger className="cursor-pointer disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
                <span className={selectedProjectId ? "" : "text-muted-foreground"}>
                  {projects.find((p) => p.id === selectedProjectId)?.name ?? "Sin proyecto"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {projects.length > 0 ? (
                  projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))
                ) : (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">No hay proyectos asignados</div>
                )}
              </SelectContent>
            </Select>
            {errors.projectId && (
              <p className="text-xs text-destructive">{errors.projectId.message}</p>
            )}
          </div>

          {artistProjects.length > 0 && (
            <div className="space-y-2">
              <Label>Artista beneficiado</Label>
              <Select
                value={watch("artistProjectId") || ""}
                onValueChange={(v) => setValue("artistProjectId", !v || v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="cursor-pointer">
                  <span className={watch("artistProjectId") ? "" : "text-muted-foreground"}>
                    {artistProjects.find((p) => p.id === watch("artistProjectId"))?.name ??
                      "Ninguna (tarea general del sello)"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ninguna (tarea general del sello)</SelectItem>
                  {artistProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!preselectedSubprojectId && subprojectsList.length > 0 && (
            <div className="space-y-2">
              <Label>Subproyecto / Campaña</Label>
              <Select
                value={watch("subprojectId") || ""}
                onValueChange={(v) => v && setValue("subprojectId", v)}
              >
                <SelectTrigger className="cursor-pointer">
                  <span className={watch("subprojectId") ? "" : "text-muted-foreground"}>
                    {subprojectsList.find((s) => s.id === watch("subprojectId"))?.name ?? "Sin subproyecto"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {subprojectsList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!preselectedContactId && (
            <div className="space-y-2">
              <Label>Contacto (opcional)</Label>
              <Select
                value={watch("contactId") || ""}
                onValueChange={(v) => v && setValue("contactId", v)}
              >
                <SelectTrigger className="cursor-pointer">
                  <span className={watch("contactId") ? "" : "text-muted-foreground"}>
                    {contactsList.find((c) => c.id === watch("contactId"))?.name ?? "Sin contacto"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {contactsList.length > 0 ? (
                    contactsList.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No hay contactos en este proyecto</div>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {!preselectedCompanyId && companiesList.length > 0 && (
            <div className="space-y-2">
              <Label>Empresa (opcional)</Label>
              <Select
                value={watch("companyId") || ""}
                onValueChange={(v) => v && setValue("companyId", v)}
              >
                <SelectTrigger className="cursor-pointer">
                  <span className={watch("companyId") ? "" : "text-muted-foreground"}>
                    {companiesList.find((c) => c.id === watch("companyId"))?.name ?? "Sin empresa"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {companiesList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!preselectedDealId && dealsList.length > 0 && (
            <div className="space-y-2">
              <Label>Deal (opcional)</Label>
              <Select
                value={watch("dealId") || ""}
                onValueChange={(v) => v && setValue("dealId", v)}
              >
                <SelectTrigger className="cursor-pointer">
                  <span className={watch("dealId") ? "" : "text-muted-foreground"}>
                    {dealsList.find((d) => d.id === watch("dealId"))?.title ?? "Sin deal"}
                  </span>
                </SelectTrigger>
                <SelectContent className="z-[80] w-[min(34rem,calc(100vw-2rem))] max-h-80 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain border border-border shadow-lg">
                  {dealsList.map((d) => (
                    <SelectItem key={d.id} value={d.id} wrapText className="py-2 leading-snug">
                      {d.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Assignees (Responsables) */}
          <AssigneeSelector
            orgMembers={orgMembers}
            selectedAssignees={selectedAssignees}
            onChange={setSelectedAssignees}
          />
          </div>

          <div className="mt-3 flex justify-end gap-2 border-t bg-background pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="cursor-pointer"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
              {isSubmitting ? "Guardando..." : "Crear Tarea"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
