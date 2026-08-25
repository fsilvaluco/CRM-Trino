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
import type { Company } from "@/types";
import { useProject } from "@/lib/project-context";

const NO_ARTIST_VALUE = "__no_artist__";

const companySchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  industry: z.string(),
  website: z.string(),
  email: z.string(),
  phone: z.string(),
  address: z.string(),
  notes: z.string(),
  artistProjectId: z.string(),
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
  const [artistProjects, setArtistProjects] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!open || !activeProject) {
      setArtistProjects([]);
      return;
    }
    fetch(`/api/projects?parentId=${activeProject.id}`)
      .then((r) => r.json())
      .then((d) => setArtistProjects(Array.isArray(d) ? d : []))
      .catch(() => setArtistProjects([]));
  }, [open, activeProject]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
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
      artistProjectId: initialData?.artistProjectId || "",
    },
  });

  const onSubmit = async (data: CompanyFormData) => {
    try {
      // Regla del rediseño de roles (ROLES.md 0.5): sin proyecto
      // seleccionado (modo "Todos los proyectos"), no se crea ni edita
      // nada -- antes esto guardaba la empresa con projectId=null en
      // silencio, exactamente el problema que motivó la regla.
      if (!activeProject?.id) {
        throw new Error("Selecciona un proyecto para poder guardar la empresa");
      }

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
          artistProjectId: data.artistProjectId || null,
        }),
      });

      if (!res.ok) throw new Error();

      toast.success(isEdit ? "Empresa actualizada" : "Empresa creada");
      reset();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Error al guardar la empresa");
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

          {artistProjects.length > 0 && (
            <div className="space-y-2">
              <Label>Artista beneficiado (opcional)</Label>
              <Select
                value={watch("artistProjectId") || NO_ARTIST_VALUE}
                onValueChange={(v) =>
                  setValue("artistProjectId", !v || v === NO_ARTIST_VALUE ? "" : v)
                }
              >
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Ninguno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ARTIST_VALUE}>Ninguno (empresa general)</SelectItem>
                  {artistProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Si eliges un artista, esta empresa tambien va a aparecer en su pipeline.
              </p>
            </div>
          )}

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
