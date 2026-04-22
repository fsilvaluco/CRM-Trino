"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

const subprojectEditSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido"),
  description: z.string().trim().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  status: z.enum(["active", "paused", "completed"]),
}).refine(
  (data) => {
    if (data.start_date && data.end_date) {
      return new Date(data.end_date).getTime() >= new Date(data.start_date).getTime();
    }
    return true;
  },
  {
    path: ["end_date"],
    message: "La fecha de fin debe ser posterior o igual a la fecha de inicio",
  }
);

type SubprojectEditFormData = z.infer<typeof subprojectEditSchema>;

export interface EditableCampaign {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
}

interface SubprojectEditSheetProps {
  open: boolean;
  campaign: EditableCampaign | null;
  onClose: () => void;
  onSaved: () => void;
}

function toDateInputValue(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function toAllowedStatus(value: string): SubprojectEditFormData["status"] {
  if (value === "active" || value === "paused" || value === "completed") {
    return value;
  }
  return "active";
}

export function SubprojectEditSheet({ open, campaign, onClose, onSaved }: SubprojectEditSheetProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SubprojectEditFormData>({
    resolver: zodResolver(subprojectEditSchema),
    defaultValues: {
      name: "",
      description: "",
      start_date: "",
      end_date: "",
      status: "active",
    },
  });

  useEffect(() => {
    if (!campaign) {
      reset({
        name: "",
        description: "",
        start_date: "",
        end_date: "",
        status: "active",
      });
      return;
    }

    reset({
      name: campaign.name,
      description: campaign.notes ?? "",
      start_date: toDateInputValue(campaign.startDate),
      end_date: toDateInputValue(campaign.endDate),
      status: toAllowedStatus(campaign.status),
    });
  }, [campaign, reset]);

  const onSubmit = async (data: SubprojectEditFormData) => {
    if (!campaign) return;

    try {
      const res = await fetch(`/api/subprojects/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          status: data.status,
          startDate: data.start_date || null,
          endDate: data.end_date || null,
          notes: data.description || null,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const errorMessage =
          (payload && typeof payload.error === "string" && payload.error) ||
          "No se pudo guardar la campaña";
        throw new Error(errorMessage);
      }

      toast.success("Campana actualizada correctamente");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al actualizar la campana");
    }
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Editar campana</SheetTitle>
          <SheetDescription>Actualiza los datos de esta campana y guarda los cambios.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="campaign-name">Nombre</Label>
            <Input
              id="campaign-name"
              placeholder="Nombre de la campana"
              {...register("name")}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="campaign-description">Descripcion</Label>
            <Textarea
              id="campaign-description"
              rows={3}
              placeholder="Objetivo, audiencia o notas de la campana"
              {...register("description")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="campaign-start-date">Fecha de inicio</Label>
              <Input id="campaign-start-date" type="date" {...register("start_date")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-end-date">Fecha de fin</Label>
              <Input id="campaign-end-date" type="date" {...register("end_date")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Estado</Label>
            <Select
              value={watch("status")}
              onValueChange={(value) => {
                if (!value) return;
                setValue("status", toAllowedStatus(value), { shouldValidate: true, shouldDirty: true });
              }}
            >
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="Selecciona un estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Activa</SelectItem>
                <SelectItem value="paused">Pausada</SelectItem>
                <SelectItem value="completed">Completada</SelectItem>
              </SelectContent>
            </Select>
            {errors.end_date && <p className="text-xs text-destructive">{errors.end_date.message}</p>}
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || !campaign} className="cursor-pointer">
              {isSubmitting ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
