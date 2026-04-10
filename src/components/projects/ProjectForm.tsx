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
import type { Project } from "@/types";

const projectSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  type: z.string(),
  status: z.enum(["active", "paused", "completed", "archived"]),
  description: z.string(),
  companyId: z.string(),
  notes: z.string(),
});

type ProjectFormData = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  open: boolean;
  onClose: () => void;
  initialData?: Partial<Project>;
}

export function ProjectForm({ open, onClose, initialData }: ProjectFormProps) {
  const isEdit = Boolean(initialData?.id);
  const [companiesList, setCompanies] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (open) {
      fetch("/api/companies")
        .then((r) => r.json())
        .then((d) => setCompanies(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
  }, [open]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: initialData?.name || "",
      type: initialData?.type || "",
      status: initialData?.status || "active",
      description: initialData?.description || "",
      companyId: initialData?.companyId || "",
      notes: initialData?.notes || "",
    },
  });

  const onSubmit = async (data: ProjectFormData) => {
    try {
      const url = isEdit ? `/api/projects/${initialData!.id}` : "/api/projects";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          type: data.type || null,
          status: data.status,
          description: data.description || null,
          companyId: data.companyId || null,
          notes: data.notes || null,
        }),
      });

      if (!res.ok) throw new Error();
      toast.success(isEdit ? "Proyecto actualizado" : "Proyecto creado");
      reset();
      onClose();
    } catch {
      toast.error("Error al guardar el proyecto");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Proyecto" : "Nuevo Proyecto"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Nombre *</Label>
            <Input id="project-name" {...register("name")} placeholder="Nombre del proyecto" />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Input {...register("type")} placeholder="ej. Campaña, Produccion" />
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select
                value={watch("status")}
                onValueChange={(v) => v && setValue("status", v as ProjectFormData["status"])}
              >
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="paused">Pausado</SelectItem>
                  <SelectItem value="completed">Completado</SelectItem>
                  <SelectItem value="archived">Archivado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {companiesList.length > 0 && (
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
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Descripcion</Label>
            <Textarea {...register("description")} placeholder="De que trata este proyecto?" rows={3} />
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea {...register("notes")} placeholder="Informacion adicional..." rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
              {isSubmitting ? "Guardando..." : isEdit ? "Actualizar" : "Crear Proyecto"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
