"use client";

import { useEffect, useState, useCallback } from "react";
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
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

// ─── Schema ───────────────────────────────────────────────────────────────────

const uuidOrEmpty = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().uuid().optional()
);

const subprojectEditSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es requerido"),
    description: z.string().trim().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    status: z.enum(["active", "paused", "completed"]),
    company_id: uuidOrEmpty,
    contact_id: uuidOrEmpty,
  })
  .refine(
    (data) => {
      if (data.start_date && data.end_date) {
        return (
          new Date(data.end_date).getTime() >= new Date(data.start_date).getTime()
        );
      }
      return true;
    },
    {
      path: ["end_date"],
      message: "La fecha de fin debe ser posterior o igual a la fecha de inicio",
    }
  );

type SubprojectEditFormData = z.infer<typeof subprojectEditSchema>;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditableCampaign {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  companyId?: string | null;
  contactId?: string | null;
}

interface Relation {
  id: string;
  name: string;
}

interface SubprojectEditSheetProps {
  open: boolean;
  campaign: EditableCampaign | null;
  onClose: () => void;
  onSaved: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function toAllowedStatus(value: string): SubprojectEditFormData["status"] {
  if (value === "active" || value === "paused" || value === "completed") {
    return value;
  }
  return "active";
}

// ─── FieldRow (matches TaskDetailSheet layout) ────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-2 py-2 border-b last:border-0">
      <span className="text-xs text-muted-foreground pt-2 font-medium">{label}</span>
      <div>{children}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SubprojectEditSheet({
  open,
  campaign,
  onClose,
  onSaved,
}: SubprojectEditSheetProps) {
  const [companies, setCompanies] = useState<Relation[]>([]);
  const [contacts, setContacts] = useState<Relation[]>([]);

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
      company_id: undefined,
      contact_id: undefined,
    },
  });

  // Reset form when campaign changes
  useEffect(() => {
    if (!campaign) {
      reset({
        name: "",
        description: "",
        start_date: "",
        end_date: "",
        status: "active",
        company_id: undefined,
        contact_id: undefined,
      });
      return;
    }

    reset({
      name: campaign.name,
      description: campaign.notes ?? "",
      start_date: toDateInputValue(campaign.startDate),
      end_date: toDateInputValue(campaign.endDate),
      status: toAllowedStatus(campaign.status),
      company_id: campaign.companyId ?? undefined,
      contact_id: campaign.contactId ?? undefined,
    });
  }, [campaign, reset]);

  // Load relation options when sheet opens
  const loadRelations = useCallback(() => {
    Promise.all([
      fetch("/api/companies").then((r) => r.json()),
      fetch("/api/contacts").then((r) => r.json()),
    ])
      .then(([cos, cts]) => {
        setCompanies(
          (cos as Array<{ id: string; name: string }>).map((x) => ({
            id: x.id,
            name: x.name,
          }))
        );
        setContacts(
          (cts as Array<{ id: string; name: string }>).map((x) => ({
            id: x.id,
            name: x.name,
          }))
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      window.setTimeout(loadRelations, 0);
    }
  }, [open, loadRelations]);

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
          companyId: data.company_id ?? null,
          contactId: data.contact_id ?? null,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const errorMessage =
          (payload && typeof payload.error === "string" && payload.error) ||
          "No se pudo guardar la campaña";
        throw new Error(errorMessage);
      }

      toast.success("Campaña actualizada correctamente");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al actualizar la campaña"
      );
    }
  };

  const currentStatus = watch("status");
  const currentCompanyId = watch("company_id");
  const currentContactId = watch("contact_id");

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl flex flex-col p-0 overflow-hidden"
      >
        {/* Header */}
        <SheetHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <SheetTitle className="text-lg font-semibold">Editar campaña</SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Actualiza los datos de esta campaña y guarda los cambios.
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <form
            id="campaign-edit-form"
            onSubmit={handleSubmit(onSubmit)}
            className="px-6 py-4 space-y-0"
          >
            {/* Nombre inline editable */}
            <div className="mb-4">
              <Label htmlFor="campaign-name" className="sr-only">
                Nombre
              </Label>
              <Input
                id="campaign-name"
                placeholder="Nombre de la campaña"
                className="text-base font-semibold border-0 shadow-none p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
              )}
            </div>

            {/* Structured fields */}
            <div className="border-b pb-4 mb-4">
              <FieldRow label="Estado">
                <Select
                  value={currentStatus}
                  onValueChange={(v) => {
                    if (!v) return;
                    setValue("status", toAllowedStatus(v), {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                  }}
                >
                  <SelectTrigger className="h-8 text-sm cursor-pointer">
                    <SelectValue placeholder="Selecciona un estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activa</SelectItem>
                    <SelectItem value="paused">Pausada</SelectItem>
                    <SelectItem value="completed">Completada</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow label="Empresa">
                <Select
                  value={currentCompanyId ?? "none"}
                  onValueChange={(v) =>
                    setValue("company_id", v === "none" ? undefined : v, {
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-sm cursor-pointer">
                    <SelectValue placeholder="Sin empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin empresa</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow label="Contacto">
                <Select
                  value={currentContactId ?? "none"}
                  onValueChange={(v) =>
                    setValue("contact_id", v === "none" ? undefined : v, {
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-sm cursor-pointer">
                    <SelectValue placeholder="Sin contacto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin contacto</SelectItem>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              <FieldRow label="Inicio">
                <Input
                  id="campaign-start-date"
                  type="date"
                  className="h-8 text-sm"
                  {...register("start_date")}
                />
              </FieldRow>

              <FieldRow label="Fin">
                <div>
                  <Input
                    id="campaign-end-date"
                    type="date"
                    className="h-8 text-sm"
                    {...register("end_date")}
                  />
                  {errors.end_date && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.end_date.message}
                    </p>
                  )}
                </div>
              </FieldRow>
            </div>

            {/* Descripción */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Descripción</p>
              <Textarea
                id="campaign-description"
                rows={5}
                placeholder="Objetivo, audiencia o notas de la campaña…"
                className="resize-none text-sm"
                {...register("description")}
              />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="cursor-pointer"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="campaign-edit-form"
            disabled={isSubmitting || !campaign}
            className="cursor-pointer"
          >
            {isSubmitting ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
