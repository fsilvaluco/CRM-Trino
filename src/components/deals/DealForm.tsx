"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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

const CREATE_CONTACT_VALUE = "__create_new_contact__";
const CREATE_COMPANY_VALUE = "__create_new_company__";

type ApiErrorPayload = {
  error?: string | { message?: string };
};

function extractApiError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const candidate = payload as ApiErrorPayload;
  if (typeof candidate.error === "string" && candidate.error.trim()) return candidate.error;
  if (candidate.error && typeof candidate.error === "object" && typeof candidate.error.message === "string" && candidate.error.message.trim()) {
    return candidate.error.message;
  }
  return fallback;
}

const dealSchema = z
  .object({
    title: z.string().min(1, "El titulo es requerido"),
    value: z.string(),
    valueType: z.enum(["fixed", "percentage"]),
    percentageValue: z.string(),
    taxType: z.enum(["afecto", "exento"]),
    associationId: z.string().min(1, "Selecciona un contacto o empresa"),
    stageId: z.string(),
    probability: z.string(),
    expectedClose: z.string(),
    notes: z.string(),
    projectId: z.string().min(1, "El proyecto es requerido"),
  })
  .superRefine((data, ctx) => {
    if (data.valueType === "fixed") {
      const parsedValue = Number.parseFloat(data.value);
      if (Number.isNaN(parsedValue) || parsedValue < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: "Ingresa un valor neto valido",
        });
      }
    }

    if (data.valueType === "percentage") {
      const parsedPercentage = Number.parseFloat(data.percentageValue);
      if (Number.isNaN(parsedPercentage) || parsedPercentage <= 0 || parsedPercentage > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["percentageValue"],
          message: "El porcentaje debe ser mayor a 0 y menor o igual a 100",
        });
      }
    }
  });

type DealFormData = z.infer<typeof dealSchema>;

interface DealRecord {
  id: string;
  title: string;
  value: number;
  valueType: "fixed" | "percentage";
  percentageValue: number | null;
  taxType: "afecto" | "exento";
  contactId: string | null;
  stageId: string;
  companyId: string | null;
  projectId: string | null;
  expectedClose: string | null;
  probability: number;
  notes: string | null;
}

interface DealFormProps {
  open: boolean;
  onClose: () => void;
  initialStageId?: string;
  initialDealId?: string;
}

function toDateInputValue(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function DealForm({ open, onClose, initialStageId, initialDealId }: DealFormProps) {
  const router = useRouter();
  const { settings } = useLocale();
  const { activeProject, projects } = useProject();
  const [contactsList, setContacts] = useState<Array<{ id: string; name: string }>>([]);
  const [companiesList, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [stagesList, setStages] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingDeal, setIsLoadingDeal] = useState(false);
  const [dealLoadError, setDealLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactCompanyId, setNewContactCompanyId] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [isCreatingNested, setIsCreatingNested] = useState(false);
  const [associationType, setAssociationType] = useState<"contacto" | "empresa">("contacto");
  const [associationQuery, setAssociationQuery] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<DealFormData>({
    resolver: zodResolver(dealSchema),
    defaultValues: {
      title: "",
      value: "",
      valueType: "fixed",
      percentageValue: "",
      taxType: "afecto",
      associationId: "",
      stageId: "",
      probability: "50",
      expectedClose: "",
      notes: "",
      projectId: activeProject?.id || "",
    },
  });

  const isEditing = Boolean(initialDealId);
  const selectedProjectId = watch("projectId");
  const selectedAssociationId = watch("associationId");
  const selectedValueType = watch("valueType");
  const selectedTaxType = watch("taxType");
  const hasActiveProject = Boolean(activeProject?.id);

  // Sync projectId when modal opens or active project changes
  useEffect(() => {
    if (!open) return;
    setValue("projectId", activeProject?.id || "");
  }, [open, activeProject?.id, setValue]);

  useEffect(() => {
    const effectiveProjectId = selectedProjectId || activeProject?.id || "";
    const params = effectiveProjectId ? `?projectId=${effectiveProjectId}` : "";
    fetch(`/api/contacts${params}`).then((r) => r.json()).then((d) => setContacts(Array.isArray(d) ? d : []));
    fetch(`/api/companies${params}`).then((r) => r.json()).then((d) => setCompanies(Array.isArray(d) ? d : []));
    fetch(`/api/pipeline${params}`)
      .then((r) => r.json())
      .then((d) => setStages(Array.isArray(d) ? d : []));
  }, [activeProject?.id, selectedProjectId]);

  useEffect(() => {
    if (!open) {
      setIsLoadingDeal(false);
      setDealLoadError(null);
      setAssociationType("contacto");
      setAssociationQuery("");
      reset({
        title: "",
        value: "",
        valueType: "fixed",
        percentageValue: "",
        taxType: "afecto",
        associationId: "",
        stageId: "",
        probability: "50",
        expectedClose: "",
        notes: "",
        projectId: activeProject?.id || "",
      });
      return;
    }

    if (!initialDealId) {
      setIsLoadingDeal(false);
      setDealLoadError(null);
      setAssociationType("contacto");
      setAssociationQuery("");
      reset({
        title: "",
        value: "",
        valueType: "fixed",
        percentageValue: "",
        taxType: "afecto",
        associationId: "",
        stageId: initialStageId || "",
        probability: "50",
        expectedClose: "",
        notes: "",
        projectId: activeProject?.id || "",
      });
      return;
    }

    const controller = new AbortController();
    setDealLoadError(null);
    setIsLoadingDeal(true);
    fetch(`/api/deals/${initialDealId}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(extractApiError(payload, "No se pudo cargar el deal"));
        }
        return payload as DealRecord;
      })
      .then((deal: DealRecord) => {
        if (controller.signal.aborted) return;
        setAssociationType(deal.contactId ? "contacto" : "empresa");
        setAssociationQuery("");
        reset({
          title: deal.title,
          value: (deal.value / 100).toFixed(2),
          valueType: deal.valueType ?? "fixed",
          percentageValue: deal.percentageValue != null ? String(deal.percentageValue) : "",
          taxType: deal.taxType ?? "afecto",
          associationId: deal.contactId || deal.companyId || "",
          stageId: deal.stageId,
          probability: String(deal.probability),
          expectedClose: toDateInputValue(deal.expectedClose),
          notes: deal.notes || "",
          projectId: activeProject?.id || deal.projectId || "",
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "No se pudo cargar el deal";
        setDealLoadError(message);
        toast.error(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingDeal(false);
        }
      });

    return () => controller.abort();
  }, [open, initialDealId, initialStageId, loadAttempt, reset, activeProject?.id]);

  // Pre-select stage AFTER stagesList is populated
  useEffect(() => {
    if (!isEditing && initialStageId && stagesList.length > 0) {
      setValue("stageId", initialStageId);
    }
  }, [initialStageId, isEditing, stagesList, setValue]);

  const resetInlineCreateState = () => {
    setNewContactName("");
    setNewContactEmail("");
    setNewContactPhone("");
    setNewContactCompanyId("");
    setNewCompanyName("");
  };

  useEffect(() => {
    if (selectedAssociationId !== CREATE_CONTACT_VALUE && selectedAssociationId !== CREATE_COMPANY_VALUE) {
      resetInlineCreateState();
    }
  }, [selectedAssociationId]);

  const handleAssociationTypeChange = (nextType: "contacto" | "empresa") => {
    if (nextType === associationType) return;
    setAssociationType(nextType);
    setAssociationQuery("");
    setValue("associationId", "", { shouldValidate: true });
    resetInlineCreateState();
  };

  const handleCreateCompany = async (): Promise<string> => {
    const effectiveProjectId = selectedProjectId || activeProject?.id || "";
    if (!effectiveProjectId) {
      throw new Error("Selecciona un proyecto para crear empresa");
    }

    if (!newCompanyName.trim()) {
      throw new Error("Ingresa el nombre de la nueva empresa");
    }

    const response = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newCompanyName.trim(),
        projectId: effectiveProjectId,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(extractApiError(payload, "No se pudo crear la empresa"));
    }

    if (!payload?.id || !payload?.name) {
      throw new Error("Respuesta invalida al crear empresa");
    }

    setCompanies((prev) => [{ id: payload.id as string, name: payload.name as string }, ...prev]);
    return payload.id as string;
  };

  const handleCreateContact = async (): Promise<string> => {
    const effectiveProjectId = selectedProjectId || activeProject?.id || "";
    if (!effectiveProjectId) {
      throw new Error("Selecciona un proyecto para crear contacto");
    }

    if (!newContactName.trim()) {
      throw new Error("Ingresa el nombre del contacto");
    }

    let companyId = newContactCompanyId;
    if (!companyId) {
      throw new Error("Selecciona una empresa para el contacto");
    }

    if (companyId === CREATE_COMPANY_VALUE) {
      companyId = await handleCreateCompany();
    }

    const response = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newContactName.trim(),
        email: newContactEmail.trim() || null,
        phone: newContactPhone.trim() || null,
        companyId,
        projectId: effectiveProjectId,
        source: "otro",
        temperature: "cold",
        score: 0,
        notes: null,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(extractApiError(payload, "No se pudo crear el contacto"));
    }

    if (!payload?.id || !payload?.name) {
      throw new Error("Respuesta invalida al crear contacto");
    }

    const createdContact = { id: payload.id as string, name: payload.name as string };
    setContacts((prev) => [createdContact, ...prev]);
    setValue("associationId", createdContact.id, { shouldValidate: true });
    return createdContact.id;
  };

  const filteredContacts = contactsList.filter((contact) =>
    contact.name.toLowerCase().includes(associationQuery.toLowerCase())
  );

  const filteredCompanies = companiesList.filter((company) =>
    company.name.toLowerCase().includes(associationQuery.toLowerCase())
  );

  const onSubmit = async (data: DealFormData) => {
    try {
      let contactId: string | null = null;
      let companyId: string | null = null;

      if (associationType === "contacto") {
        companyId = null;
        if (data.associationId === CREATE_CONTACT_VALUE) {
          setIsCreatingNested(true);
          contactId = await handleCreateContact();
          setIsCreatingNested(false);
        } else {
          contactId = data.associationId;
        }
      } else {
        contactId = null;
        if (data.associationId === CREATE_COMPANY_VALUE) {
          setIsCreatingNested(true);
          companyId = await handleCreateCompany();
          setValue("associationId", companyId, { shouldValidate: true });
          setIsCreatingNested(false);
        } else {
          companyId = data.associationId;
        }
      }

      const url = isEditing ? `/api/deals/${initialDealId!}` : "/api/deals";
      const method = isEditing ? "PUT" : "POST";
      const parsedValue = Number.parseFloat(data.value || "0");
      const parsedPercentageValue = Number.parseFloat(data.percentageValue || "0");
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          contactId,
          companyId,
          value: data.valueType === "fixed" ? Math.round(parsedValue * 100) : 0,
          valueType: data.valueType,
          percentageValue: data.valueType === "percentage" ? parsedPercentageValue : null,
          taxType: data.taxType,
          probability: parseInt(data.probability || "0"),
          projectId: data.projectId || null,
        }),
      });

      if (!res.ok) throw new Error(isEditing ? "Error al actualizar deal" : "Error al crear deal");

      toast.success(isEditing ? "Deal actualizado exitosamente" : "Deal creado exitosamente");
      reset();
      resetInlineCreateState();
      onClose();
      router.refresh();
    } catch (error) {
      setIsCreatingNested(false);
      const message = error instanceof Error ? error.message : isEditing ? "Error al actualizar el deal" : "Error al crear el deal";
      toast.error(message);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          resetInlineCreateState();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Deal" : "Nuevo Deal"}</DialogTitle>
        </DialogHeader>

        {isLoadingDeal ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Cargando deal...
          </div>
        ) : dealLoadError ? (
          <div className="space-y-4 py-6 text-center">
            <p className="text-sm text-destructive">{dealLoadError}</p>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={() => setLoadAttempt((current) => current + 1)}
            >
              Reintentar
            </Button>
          </div>
        ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Proyecto</Label>
            <Select
              value={selectedProjectId || ""}
              onValueChange={(v) => {
                if (!v) return;
                setValue("projectId", v);
              }}
              disabled={hasActiveProject}
            >
              <SelectTrigger className="cursor-pointer disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
                <span className={selectedProjectId ? "" : "text-muted-foreground"}>
                  {projects.find((p) => p.id === selectedProjectId)?.name ?? "Sin proyecto"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {projects.length > 0 ? (
                  projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))
                ) : (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">No hay proyectos asignados</div>
                )}
              </SelectContent>
            </Select>
            {errors.projectId && (
              <p className="text-xs text-destructive">{errors.projectId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="deal-title">Titulo *</Label>
            <Input id="deal-title" {...register("title")} placeholder="Ej: Servicio Premium - Empresa X" />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Tipo de cierre *</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={selectedValueType === "fixed" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => {
                  setValue("valueType", "fixed", { shouldValidate: true });
                  setValue("percentageValue", "", { shouldValidate: true });
                }}
              >
                Monto fijo
              </Button>
              <Button
                type="button"
                variant={selectedValueType === "percentage" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => {
                  setValue("valueType", "percentage", { shouldValidate: true });
                  setValue("value", "0", { shouldValidate: true });
                }}
              >
                % recaudación
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              {selectedValueType === "fixed" ? (
                <>
                  <Label htmlFor="deal-value">Valor neto ({settings.currency})</Label>
                  <Input
                    id="deal-value"
                    type="number"
                    step="0.01"
                    {...register("value")}
                    placeholder="0.00"
                  />
                  {errors.value && (
                    <p className="text-xs text-destructive">{errors.value.message}</p>
                  )}
                </>
              ) : (
                <>
                  <Label htmlFor="deal-percentage">% participación recaudación</Label>
                  <Input
                    id="deal-percentage"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    {...register("percentageValue")}
                    placeholder="30"
                  />
                  {errors.percentageValue && (
                    <p className="text-xs text-destructive">{errors.percentageValue.message}</p>
                  )}
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label>Probabilidad (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                {...register("probability")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>IVA</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={selectedTaxType === "afecto" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setValue("taxType", "afecto", { shouldValidate: true })}
              >
                Afecto
              </Button>
              <Button
                type="button"
                variant={selectedTaxType === "exento" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setValue("taxType", "exento", { shouldValidate: true })}
              >
                Exento
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tipo de asociacion *</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={associationType === "contacto" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => handleAssociationTypeChange("contacto")}
              >
                Contacto
              </Button>
              <Button
                type="button"
                variant={associationType === "empresa" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => handleAssociationTypeChange("empresa")}
              >
                Empresa
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{associationType === "contacto" ? "Contacto" : "Empresa"} *</Label>
            <Input
              value={associationQuery}
              onChange={(event) => setAssociationQuery(event.target.value)}
              placeholder={associationType === "contacto" ? "Buscar contacto..." : "Buscar empresa..."}
            />
            <Select
              value={selectedAssociationId || ""}
              onValueChange={(v) => {
                if (!v) return;
                setValue("associationId", v, { shouldValidate: true });
              }}
            >
              <SelectTrigger className="cursor-pointer">
                <span className={selectedAssociationId ? "" : "text-muted-foreground"}>
                  {selectedAssociationId === CREATE_CONTACT_VALUE
                    ? "Crear nuevo contacto"
                    : selectedAssociationId === CREATE_COMPANY_VALUE
                      ? "Crear nueva empresa"
                      : associationType === "contacto"
                        ? contactsList.find((c) => c.id === selectedAssociationId)?.name ?? "Seleccionar contacto"
                        : companiesList.find((c) => c.id === selectedAssociationId)?.name ?? "Seleccionar empresa"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {associationType === "contacto" ? (
                  <>
                    {filteredContacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={CREATE_CONTACT_VALUE}>+ Crear nuevo contacto</SelectItem>
                  </>
                ) : (
                  <>
                    {filteredCompanies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={CREATE_COMPANY_VALUE}>+ Crear nueva empresa</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            {errors.associationId && (
              <p className="text-xs text-destructive">{errors.associationId.message}</p>
            )}

            {associationType === "contacto" && selectedAssociationId === CREATE_CONTACT_VALUE && (
              <div className="mt-2 space-y-2 rounded-md border p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-contact-name">Nombre contacto *</Label>
                  <Input
                    id="new-contact-name"
                    value={newContactName}
                    onChange={(event) => setNewContactName(event.target.value)}
                    placeholder="Ej: Juan Perez"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-contact-email">Email</Label>
                    <Input
                      id="new-contact-email"
                      type="email"
                      value={newContactEmail}
                      onChange={(event) => setNewContactEmail(event.target.value)}
                      placeholder="juan@empresa.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-contact-phone">Telefono</Label>
                    <Input
                      id="new-contact-phone"
                      value={newContactPhone}
                      onChange={(event) => setNewContactPhone(event.target.value)}
                      placeholder="+56 9..."
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Empresa *</Label>
                  <Select
                    value={newContactCompanyId}
                    onValueChange={(value) => setNewContactCompanyId(value ?? "")}
                  >
                    <SelectTrigger className="cursor-pointer">
                      <SelectValue placeholder="Seleccionar empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={CREATE_COMPANY_VALUE}>+ Crear nueva empresa</SelectItem>
                      {companiesList.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {newContactCompanyId === CREATE_COMPANY_VALUE && (
                  <div className="space-y-1.5">
                    <Label htmlFor="new-company-name">Nombre empresa nueva *</Label>
                    <Input
                      id="new-company-name"
                      value={newCompanyName}
                      onChange={(event) => setNewCompanyName(event.target.value)}
                      placeholder="Ej: Empresa X"
                    />
                  </div>
                )}
              </div>
            )}

            {associationType === "empresa" && selectedAssociationId === CREATE_COMPANY_VALUE && (
              <div className="mt-2 space-y-2 rounded-md border p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="quick-company-name">Nombre empresa *</Label>
                  <Input
                    id="quick-company-name"
                    value={newCompanyName}
                    onChange={(event) => setNewCompanyName(event.target.value)}
                    placeholder="Ej: Empresa X"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Etapa</Label>
              <Select
                value={watch("stageId") || ""}
                onValueChange={(v) => v && setValue("stageId", v)}
              >
                <SelectTrigger className="cursor-pointer">
                  <span className={watch("stageId") ? "" : "text-muted-foreground"}>
                    {stagesList.find((s) => s.id === watch("stageId"))?.name ?? "Primera etapa"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {stagesList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cierre estimado</Label>
              <Input type="date" {...register("expectedClose")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deal-notes">Notas</Label>
            <Textarea id="deal-notes" {...register("notes")} rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || isCreatingNested} className="cursor-pointer">
              {isCreatingNested ? "Creando asociado..." : isSubmitting ? "Guardando..." : isEditing ? "Actualizar Deal" : "Crear Deal"}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
