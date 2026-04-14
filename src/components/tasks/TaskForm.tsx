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

const taskSchema = z.object({
  title: z.string().min(1, "El titulo es requerido"),
  description: z.string(),
  priority: z.enum(["low", "medium", "high"]),
  dueDate: z.string(),
  contactId: z.string(),
  companyId: z.string(),
  dealId: z.string(),
  projectId: z.string(),
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
}

export function TaskForm({
  open,
  onClose,
  preselectedContactId,
  preselectedDealId,
  preselectedCompanyId,
  preselectedProjectId,
  preselectedSubprojectId,
}: TaskFormProps) {
  const { activeProject } = useProject();
  const [contactsList, setContacts] = useState<Array<{ id: string; name: string }>>([]);
  const [dealsList, setDeals] = useState<Array<{ id: string; title: string }>>([]);
  const [companiesList, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [projectsList, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [subprojectsList, setSubprojects] = useState<Array<{ id: string; name: string }>>([]);

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
      title: "",
      description: "",
      priority: "medium",
      dueDate: "",
      contactId: preselectedContactId || "",
      companyId: preselectedCompanyId || "",
      dealId: preselectedDealId || "",
      projectId: preselectedProjectId || activeProject?.id || "",
      subprojectId: preselectedSubprojectId || "",
    },
  });

  const watchedProjectId = watch("projectId");

  useEffect(() => {
    if (!open) return;
    const projectParam = activeProject ? `?projectId=${activeProject.id}` : "";
    if (!preselectedContactId) {
      fetch(`/api/contacts${projectParam}`).then((r) => r.json()).then((d) => setContacts(Array.isArray(d) ? d : [])).catch(() => {});
    }
    if (!preselectedDealId) {
      fetch(`/api/deals${projectParam}`).then((r) => r.json()).then((d) => setDeals(Array.isArray(d) ? d : [])).catch(() => {});
    }
    if (!preselectedCompanyId) {
      fetch(`/api/companies${projectParam}`).then((r) => r.json()).then((d) => setCompanies(Array.isArray(d) ? d : [])).catch(() => {});
    }
    if (!preselectedProjectId) {
      fetch("/api/projects").then((r) => r.json()).then((d) => setProjects(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [open, activeProject, preselectedContactId, preselectedDealId, preselectedCompanyId, preselectedProjectId]);

  // Cargar subproyectos cuando cambia el proyecto seleccionado
  useEffect(() => {
    if (!watchedProjectId) {
      setSubprojects([]);
      setValue("subprojectId", "");
      return;
    }
    fetch(`/api/subprojects?projectId=${watchedProjectId}`)
      .then((r) => r.json())
      .then((d) => setSubprojects(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [watchedProjectId, setValue]);

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
          subprojectId: data.subprojectId || null,
        }),
      });

      if (!res.ok) throw new Error("Error al crear tarea");

      toast.success("Tarea creada");
      reset();
      onClose();
    } catch {
      toast.error("Error al crear la tarea");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Tarea</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
          {!preselectedContactId && contactsList.length > 0 && (
            <div className="space-y-2">
              <Label>Contacto</Label>
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
                  {contactsList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!preselectedCompanyId && companiesList.length > 0 && (
            <div className="space-y-2">
              <Label>Empresa</Label>
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
              <Label>Deal</Label>
              <Select
                value={watch("dealId") || ""}
                onValueChange={(v) => v && setValue("dealId", v)}
              >
                <SelectTrigger className="cursor-pointer">
                  <span className={watch("dealId") ? "" : "text-muted-foreground"}>
                    {dealsList.find((d) => d.id === watch("dealId"))?.title ?? "Sin deal"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {dealsList.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!preselectedProjectId && projectsList.length > 0 && (
            <div className="space-y-2">
              <Label>Proyecto</Label>
              <Select
                value={watch("projectId") || ""}
                onValueChange={(v) => v && setValue("projectId", v)}
              >
                <SelectTrigger className="cursor-pointer">
                  <span className={watch("projectId") ? "" : "text-muted-foreground"}>
                    {projectsList.find((p) => p.id === watch("projectId"))?.name ?? "Sin proyecto"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {projectsList.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!preselectedSubprojectId && subprojectsList.length > 0 && (
            <div className="space-y-2">
              <Label>Subproyecto</Label>
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

          <div className="flex justify-end gap-2 pt-2">
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
