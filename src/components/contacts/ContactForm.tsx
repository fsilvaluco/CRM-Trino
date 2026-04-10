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
import { useLocale } from "@/lib/locale-context";
import { useProject } from "@/lib/project-context";

const contactSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  email: z.string().email("Email invalido").or(z.literal("")),
  phone: z.string(),
  companyId: z.string(), // FK to companies table
  newCompanyName: z.string(), // for creating a new company on the fly
  source: z.string(),
  temperature: z.enum(["cold", "warm", "hot"]),
  notes: z.string(),
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
    source?: string;
    temperature?: string;
    notes?: string;
  };
}

const NEW_COMPANY_VALUE = "__new__";

export function ContactForm({ open, onClose, initialData }: ContactFormProps) {
  const router = useRouter();
  const isEditing = !!initialData?.id;
  const { settings } = useLocale();
  const { activeProject } = useProject();
  const [companiesList, setCompanies] = useState<CompanyOption[]>([]);

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

  const onSubmit = async (data: ContactFormData) => {
    try {
      let finalCompanyId = data.companyId === NEW_COMPANY_VALUE ? null : data.companyId || null;
      let finalCompanyName = "";

      // Create new company on the fly if selected
      if (data.companyId === NEW_COMPANY_VALUE && data.newCompanyName.trim()) {
        const res = await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: data.newCompanyName.trim() }),
        });
        if (res.ok) {
          const company = await res.json();
          finalCompanyId = company.id;
          finalCompanyName = company.name;
        }
      } else if (finalCompanyId) {
        const found = companiesList.find((c) => c.id === finalCompanyId);
        finalCompanyName = found?.name || "";
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
          company: finalCompanyName || null,
          companyId: finalCompanyId,
          source: data.source,
          temperature: data.temperature,
          notes: data.notes || null,
          projectId: activeProject?.id ?? null,
        }),
      });

      if (!res.ok) throw new Error("Error al guardar");

      toast.success(isEditing ? "Contacto actualizado" : "Contacto creado");
      reset();
      onClose();
      router.refresh();
    } catch {
      toast.error("Error al guardar el contacto");
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
              onValueChange={(v) => v && setValue("companyId", v)}
            >
              <SelectTrigger className="cursor-pointer">
                <SelectValue placeholder="Sin empresa" />
              </SelectTrigger>
              <SelectContent>
                {companiesList.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
                <SelectItem value={NEW_COMPANY_VALUE}>+ Nueva empresa...</SelectItem>
              </SelectContent>
            </Select>
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
