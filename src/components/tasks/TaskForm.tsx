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
import { Checkbox } from "@/components/ui/checkbox";

const taskSchema = z.object({
  title: z.string().min(1, "El titulo es requerido"),
  description: z.string(),
  priority: z.enum(["low", "medium", "high"]),
  dueDate: z.string(),
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
  const [subprojectsList, setSubprojects] = useState<Array<{ id: string; name: string }>>([]);
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
      title: "",
      description: "",
      priority: "medium",
      dueDate: "",
      contactId: preselectedContactId || "",
      companyId: preselectedCompanyId || "",
      dealId: preselectedDealId || "",
      subprojectId: preselectedSubprojectId || "",
    },
  });

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
    // Cargar subproyectos del proyecto activo
    if (activeProject?.id) {
      fetch(`/api/subprojects?projectId=${activeProject.id}`)
        .then((r) => r.json())
        .then((d) => setSubprojects(Array.isArray(d) ? d : []))
        .catch(() => {});
    } else {
      setSubprojects([]);
    }
    // Cargar miembros de la organizacion
    fetch("/api/org-members")
      .then((r) => r.json())
      .then((d) => setOrgMembers(Array.isArray(d) ? d.filter((m: { status: string }) => m.status === "active") : []))
      .catch(() => {});
  }, [open, activeProject, preselectedContactId, preselectedDealId, preselectedCompanyId]);

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
          projectId: activeProject?.id || null,
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

          {/* Assignees (Responsables) */}
          {orgMembers.length > 0 && (
            <div className="space-y-2">
              <Label>Asignar a:</Label>
              <div className="border rounded-md p-3 space-y-2 max-h-32 overflow-y-auto">
                {orgMembers.map((member) => {
                  const isChecked = selectedAssignees.includes(member.user_id);
                  return (
                    <div key={member.user_id} className="flex items-center gap-2">
                      <Checkbox
                        id={`assignee-${member.user_id}`}
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedAssignees([...selectedAssignees, member.user_id]);
                          } else {
                            setSelectedAssignees(selectedAssignees.filter((id) => id !== member.user_id));
                          }
                        }}
                      />
                      <label
                        htmlFor={`assignee-${member.user_id}`}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {member.profiles?.full_name || member.profiles?.email || "Usuario sin nombre"}
                      </label>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedAssignees.length === 0
                  ? "Sin asignar"
                  : `${selectedAssignees.length} persona${selectedAssignees.length > 1 ? "s" : ""} seleccionada${selectedAssignees.length > 1 ? "s" : ""}`}
              </p>
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
