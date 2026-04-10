"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Company } from "@/types";
import { useProject } from "@/lib/project-context";

const companySchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  industry: z.string(),
  website: z.string(),
  email: z.string(),
  phone: z.string(),
  address: z.string(),
  notes: z.string(),
});

type CompanyFormData = z.infer<typeof companySchema>;

interface CompanyFormProps {
  open: boolean;
  onClose: () => void;
  initialData?: Partial<Company>;
}

export function CompanyForm({ open, onClose, initialData }: CompanyFormProps) {
  const isEdit = Boolean(initialData?.id);
  const { activeProject } = useProject();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: initialData?.name || "",
      industry: initialData?.industry || "",
      website: initialData?.website || "",
      email: initialData?.email || "",
      phone: initialData?.phone || "",
      address: initialData?.address || "",
      notes: initialData?.notes || "",
    },
  });

  const onSubmit = async (data: CompanyFormData) => {
    try {
      const url = isEdit ? `/api/companies/${initialData!.id}` : "/api/companies";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          industry: data.industry || null,
          website: data.website || null,
          email: data.email || null,
          phone: data.phone || null,
          address: data.address || null,
          notes: data.notes || null,
          projectId: activeProject?.id ?? null,
        }),
      });

      if (!res.ok) throw new Error();

      toast.success(isEdit ? "Empresa actualizada" : "Empresa creada");
      reset();
      onClose();
    } catch {
      toast.error("Error al guardar la empresa");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Empresa" : "Nueva Empresa"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Nombre *</Label>
            <Input id="company-name" {...register("name")} placeholder="Nombre de la empresa" />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Rubro / Industria</Label>
              <Input {...register("industry")} placeholder="ej. Marketing" />
            </div>
            <div className="space-y-2">
              <Label>Sitio web</Label>
              <Input {...register("website")} placeholder="https://..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input {...register("email")} type="email" placeholder="contacto@empresa.com" />
            </div>
            <div className="space-y-2">
              <Label>Telefono</Label>
              <Input {...register("phone")} placeholder="+52 55 ..." />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Direccion</Label>
            <Input {...register("address")} placeholder="Calle, ciudad, pais" />
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea {...register("notes")} placeholder="Informacion adicional..." rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
              {isSubmitting ? "Guardando..." : isEdit ? "Actualizar" : "Crear Empresa"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
