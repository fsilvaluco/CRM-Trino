"use client";

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
import type { Subproject } from "@/types";

const subprojectSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  status: z.enum(["active", "paused", "completed"]),
  startDate: z.string(),
  endDate: z.string(),
  notes: z.string(),
});

type SubprojectFormData = z.infer<typeof subprojectSchema>;

interface SubprojectFormProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  initialData?: Partial<Subproject>;
}

export function SubprojectForm({ open, onClose, projectId, initialData }: SubprojectFormProps) {
  const isEdit = Boolean(initialData?.id);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<SubprojectFormData>({
    resolver: zodResolver(subprojectSchema),
    defaultValues: {
      name: initialData?.name || "",
      status: initialData?.status || "active",
      startDate: "",
      endDate: "",
      notes: initialData?.notes || "",
    },
  });

  const onSubmit = async (data: SubprojectFormData) => {
    try {
      const url = isEdit ? `/api/subprojects/${initialData!.id}` : "/api/subprojects";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          status: data.status,
          projectId,
          startDate: data.startDate || null,
          endDate: data.endDate || null,
          notes: data.notes || null,
        }),
      });

      if (!res.ok) throw new Error();
      toast.success(isEdit ? "Subproyecto actualizado" : "Subproyecto creado");
      reset();
      onClose();
    } catch {
      toast.error("Error al guardar el subproyecto");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Subproyecto" : "Nuevo Subproyecto"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sub-name">Nombre *</Label>
            <Input id="sub-name" {...register("name")} placeholder="Nombre del subproyecto" />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Estado</Label>
            <Select
              value={watch("status")}
              onValueChange={(v) => v && setValue("status", v as SubprojectFormData["status"])}
            >
              <SelectTrigger className="cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="paused">Pausado</SelectItem>
                <SelectItem value="completed">Completado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Inicio</Label>
              <Input type="date" {...register("startDate")} />
            </div>
            <div className="space-y-2">
              <Label>Fin</Label>
              <Input type="date" {...register("endDate")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea {...register("notes")} placeholder="Descripcion o notas..." rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
              {isSubmitting ? "Guardando..." : isEdit ? "Actualizar" : "Crear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
