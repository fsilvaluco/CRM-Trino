"use client";


import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import type { Project } from "@/types";

const PROJECT_TYPES = ["Teatro", "Música", "Personal", "Otro"] as const;
const NO_SELLO_VALUE = "__no_sello__";

const projectSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  type: z.string(),
  status: z.enum(["active", "paused", "completed", "archived"]),
  description: z.string(),
  notes: z.string(),
  parentProjectId: z.string(),
  selfManaged: z.boolean(),
  driveUrl: z.string(),
  defaultCommissionRate: z.string(),
});

type ProjectFormData = z.infer<typeof projectSchema>;

interface ProjectFormProps {
  open: boolean;
  onClose: () => void;
  initialData?: Partial<Project>;
}

export function ProjectForm({ open, onClose, initialData }: ProjectFormProps) {
  const isEdit = Boolean(initialData?.id);
  const [selloOptions, setSelloOptions] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!open) return;
    // Cualquier proyecto puede actuar como sello (Trino, Katarsis, SiSoy hoy
    // lo son) -- se excluye el proyecto que se esta editando para que no
    // pueda ser padre de si mismo.
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setSelloOptions(
          list
            .filter((p: { id: string }) => p.id !== initialData?.id)
            .map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
        );
      })
      .catch(() => setSelloOptions([]));
  }, [open, initialData?.id]);

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
      notes: initialData?.notes || "",
      parentProjectId: initialData?.parentProjectId || "",
      selfManaged: initialData?.selfManaged ?? false,
      driveUrl: initialData?.driveUrl || "",
      defaultCommissionRate: initialData?.defaultCommissionRate != null ? String(initialData.defaultCommissionRate) : "30",
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
          notes: data.notes || null,
          parentProjectId: data.parentProjectId || null,
          selfManaged: data.selfManaged,
          driveUrl: data.driveUrl || null,
          defaultCommissionRate: data.defaultCommissionRate ? parseFloat(data.defaultCommissionRate) : 30,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      toast.success(isEdit ? "Proyecto actualizado" : "Proyecto creado");
      reset();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      toast.error(`Error al guardar el proyecto: ${msg}`);
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
              <Select
                value={watch("type") || ""}
                onValueChange={(v) => v && setValue("type", v)}
              >
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          <div className="space-y-2">
            <Label>Sello / Agencia (opcional)</Label>
            <Select
              value={watch("parentProjectId") || ""}
              onValueChange={(v) => setValue("parentProjectId", v === NO_SELLO_VALUE ? "" : (v ?? ""))}
            >
              <SelectTrigger className="cursor-pointer">
                <span className={watch("parentProjectId") ? "" : "text-muted-foreground"}>
                  {selloOptions.find((p) => p.id === watch("parentProjectId"))?.name ??
                    "Ninguno (proyecto independiente)"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SELLO_VALUE}>Ninguno (proyecto independiente)</SelectItem>
                {selloOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Si este proyecto es un artista gestionado por una agencia (ej: Trino), selecciona
              cual. Sus tratos y tareas quedaran visibles en el pipeline del sello.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="project-self-managed"
              checked={watch("selfManaged")}
              onCheckedChange={(v) => setValue("selfManaged", v === true)}
            />
            <Label htmlFor="project-self-managed" className="cursor-pointer">
              Autogestionado (puede editar sus propios tratos, no solo verlos)
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-commission-rate">Comisión Trino por defecto (%)</Label>
            <Input
              id="project-commission-rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              {...register("defaultCommissionRate")}
              placeholder="30"
            />
            <p className="text-xs text-muted-foreground">
              Base para calcular la comisión de los tratos de este proyecto (ver campo &quot;Fuente&quot; en
              cada trato). Se puede pisar puntualmente en un trato específico.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Link de Drive (opcional)</Label>
            <Input
              {...register("driveUrl")}
              placeholder="https://drive.google.com/drive/folders/..."
            />
            <p className="text-xs text-muted-foreground">
              Carpeta o unidad compartida de Google Drive de este proyecto. Aparece como botón
              rápido arriba en la app para cualquiera con acceso al proyecto.
            </p>
          </div>

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
