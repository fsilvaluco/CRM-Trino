"use client";

import { useRouter } from "next/navigation";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
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
import { useLocale } from "@/lib/locale-context";
import { useProject } from "@/lib/project-context";

const NEW_COMPANY_VALUE = "__new__";
const uuidSchema = z.string().uuid("Company ID invalido");

const contactSchema = z
  .object({
    name: z.string().min(1, "El nombre es requerido"),
    email: z.string().email("Email invalido").or(z.literal("")),
    phone: z.string(),
    companyId: z.union([
      z.string().uuid("Selecciona una empresa valida"),
      z.literal(NEW_COMPANY_VALUE),
    ]),
    newCompanyName: z.string(),
    source: z.string(),
    temperature: z.enum(["cold", "warm", "hot"]),
    notes: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.companyId === NEW_COMPANY_VALUE && data.newCompanyName.trim() === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newCompanyName"],
        message: "Escribe el nombre de la nueva empresa",
      });
    }
  });

type ContactFormData = z.infer<typeof contactSchema>;

interface CompanyOption {
  id: string;
  name: string;
}

interface ContactFormProps {
  open: boolean;
  onClose: () => void;
  initialData?: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
    company?: string;   // legacy text
    companyId?: string; // FK
    score?: number;
    source?: string;
    temperature?: string;
    notes?: string;
  };
}

export function ContactForm({ open, onClose, initialData }: ContactFormProps) {
  const router = useRouter();
  const isEditing = !!initialData?.id;
  const { settings } = useLocale();
  const { activeProject } = useProject();
  const [companiesList, setCompanies] = useState<CompanyOption[]>([]);

  useEffect(() => {
    if (open) {
      const params = activeProject ? `?projectId=${activeProject.id}` : "";
      fetch(`/api/companies${params}`)
        .then((r) => r.json())
        .then((d) => setCompanies(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
  }, [open, activeProject]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: initialData?.name || "",
      email: initialData?.email || "",
      phone: initialData?.phone || "",
      companyId: initialData?.companyId || "",
      newCompanyName: "",
      source: initialData?.source || "otro",
      temperature: (initialData?.temperature as ContactFormData["temperature"]) || "cold",
      notes: initialData?.notes || "",
    },
  });

  const watchedCompanyId = watch("companyId");
  const showNewCompanyInput = watchedCompanyId === NEW_COMPANY_VALUE;
  const selectedCompanyMissing =
    !!watchedCompanyId &&
    watchedCompanyId !== NEW_COMPANY_VALUE &&
    !companiesList.some((company) => company.id === watchedCompanyId);

  const onSubmit = async (data: ContactFormData) => {
    try {
      if (!activeProject?.id) {
        throw new Error("Debes seleccionar un proyecto antes de crear un contacto");
      }

      let finalCompanyId = data.companyId === NEW_COMPANY_VALUE ? null : data.companyId || null;

      if (finalCompanyId && !uuidSchema.safeParse(finalCompanyId).success) {
        throw new Error("El company_id seleccionado no es un UUID valido");
      }

      // Create new company on the fly if selected
      if (data.companyId === NEW_COMPANY_VALUE && data.newCompanyName.trim()) {
        const res = await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.newCompanyName.trim(),
            projectId: activeProject?.id ?? null,
          }),
        });
        if (!res.ok) {
          let message = "Error al crear la empresa";
          try {
            const payload = await res.json();
            if (payload?.error?.message) {
              message = payload.error.message;
            } else if (typeof payload?.error === "string") {
              message = payload.error;
            }
          } catch {
            // Keep default message when response body is not JSON.
          }
          throw new Error(message);
        }

        const company = await res.json();
        finalCompanyId = company.id;

        if (!uuidSchema.safeParse(finalCompanyId).success) {
          throw new Error("La API devolvio un company_id invalido al crear la empresa");
        }
      }

      if (!finalCompanyId) {
        throw new Error("Debes seleccionar o crear una empresa valida");
      }

      const url = isEditing ? `/api/contacts/${initialData!.id}` : "/api/contacts";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email || null,
          phone: data.phone || null,
          companyId: finalCompanyId,
          source: data.source,
          temperature: data.temperature,
          score: initialData?.score ?? 0,
          notes: data.notes || null,
          projectId: activeProject.id,
        }),
      });

      if (!res.ok) {
        let message = "Error al guardar el contacto";
        try {
          const payload = await res.json();
          if (payload?.error?.message) {
            message = payload.error.message;
          } else if (typeof payload?.error === "string") {
            message = payload.error;
          }
        } catch {
          // Keep default message when response body is not JSON.
        }
        throw new Error(message);
      }

      toast.success(isEditing ? "Contacto actualizado" : "Contacto creado");
      reset();
      onClose();
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al guardar el contacto";
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Contacto" : "Nuevo Contacto"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input id="name" {...register("name")} placeholder="Nombre completo" />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} placeholder="correo@ejemplo.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefono</Label>
              <Input id="phone" {...register("phone")} placeholder={`${settings.phonePrefix} 9 1234 5678`} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Empresa</Label>
            <Select
              value={watch("companyId")}
              onValueChange={(v) => {
                if (!v) {
                  return;
                }

                setValue("companyId", v, { shouldValidate: true, shouldDirty: true });
              }}
            >
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="Selecciona una empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Empresas</SelectLabel>
                  {companiesList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                  {selectedCompanyMissing && (
                    <SelectItem value={watchedCompanyId}>
                      {initialData?.company || "Empresa seleccionada"}
                    </SelectItem>
                  )}
                </SelectGroup>
                <SelectSeparator />
                <SelectItem value={NEW_COMPANY_VALUE}>+ Nueva empresa...</SelectItem>
              </SelectContent>
            </Select>
            {errors.companyId && (
              <p className="text-xs text-destructive">{errors.companyId.message}</p>
            )}
          </div>

          {showNewCompanyInput && (
            <div className="space-y-2">
              <Label htmlFor="newCompanyName">Nombre de la nueva empresa</Label>
              <Input
                id="newCompanyName"
                {...register("newCompanyName")}
                placeholder="Nombre de la empresa"
                autoFocus
              />
                {errors.newCompanyName && (
                  <p className="text-xs text-destructive">{errors.newCompanyName.message}</p>
                )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Fuente</Label>
              <Select value={watch("source")} onValueChange={(v) => v && setValue("source", v)}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="website">Sitio web</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="referido">Referido</SelectItem>
                  <SelectItem value="redes_sociales">Redes sociales</SelectItem>
                  <SelectItem value="llamada_fria">Llamada fria</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="formulario">Formulario</SelectItem>
                  <SelectItem value="evento">Evento</SelectItem>
                  <SelectItem value="import">Importado</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Temperatura</Label>
              <Select
                value={watch("temperature")}
                onValueChange={(v) => v && setValue("temperature", v as ContactFormData["temperature"])}
              >
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cold">Frio</SelectItem>
                  <SelectItem value="warm">Tibio</SelectItem>
                  <SelectItem value="hot">Caliente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" {...register("notes")} placeholder="Notas sobre el contacto..." rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
              {isSubmitting ? "Guardando..." : isEditing ? "Actualizar" : "Crear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
