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

const dealSchema = z.object({
  title: z.string().min(1, "El titulo es requerido"),
  value: z.string(),
  contactId: z.string().min(1, "El contacto es requerido"),
  stageId: z.string(),
  probability: z.string(),
  expectedClose: z.string(),
  notes: z.string(),
});

type DealFormData = z.infer<typeof dealSchema>;

interface DealFormProps {
  open: boolean;
  onClose: () => void;
  initialStageId?: string;
}

export function DealForm({ open, onClose, initialStageId }: DealFormProps) {
  const router = useRouter();
  const { settings } = useLocale();
  const { activeProject } = useProject();
  const [contactsList, setContacts] = useState<Array<{ id: string; name: string }>>([]);
  const [companiesList, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [stagesList, setStages] = useState<Array<{ id: string; name: string }>>([]);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactCompanyId, setNewContactCompanyId] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [isCreatingNested, setIsCreatingNested] = useState(false);

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
      contactId: "",
      stageId: "",
      probability: "50",
      expectedClose: "",
      notes: "",
    },
  });

  useEffect(() => {
    const params = activeProject ? `?projectId=${activeProject.id}` : "";
    fetch(`/api/contacts${params}`).then((r) => r.json()).then((d) => setContacts(Array.isArray(d) ? d : []));
    fetch(`/api/companies${params}`).then((r) => r.json()).then((d) => setCompanies(Array.isArray(d) ? d : []));
    fetch(`/api/pipeline${params}`)
      .then((r) => r.json())
      .then((d) => setStages(Array.isArray(d) ? d : []));
  }, [activeProject]);

  // Pre-select stage AFTER stagesList is populated
  useEffect(() => {
    if (initialStageId && stagesList.length > 0) {
      setValue("stageId", initialStageId);
    }
  }, [initialStageId, stagesList, setValue]);

  const resetInlineCreateState = () => {
    setNewContactName("");
    setNewContactEmail("");
    setNewContactPhone("");
    setNewContactCompanyId("");
    setNewCompanyName("");
  };

  const selectedContactId = watch("contactId");

  useEffect(() => {
    if (selectedContactId !== CREATE_CONTACT_VALUE) {
      resetInlineCreateState();
    }
  }, [selectedContactId]);

  const handleCreateCompany = async (): Promise<string> => {
    if (!activeProject?.id) {
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
        projectId: activeProject.id,
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
    if (!activeProject?.id) {
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
        projectId: activeProject.id,
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
    setValue("contactId", createdContact.id, { shouldValidate: true });
    return createdContact.id;
  };

  const onSubmit = async (data: DealFormData) => {
    try {
      let contactId = data.contactId;

      if (contactId === CREATE_CONTACT_VALUE) {
        setIsCreatingNested(true);
        contactId = await handleCreateContact();
        setIsCreatingNested(false);
      }

      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          contactId,
          value: Math.round(parseFloat(data.value || "0") * 100),
          probability: parseInt(data.probability || "0"),
          projectId: activeProject?.id ?? null,
        }),
      });

      if (!res.ok) throw new Error("Error al crear deal");

      toast.success("Deal creado exitosamente");
      reset();
      resetInlineCreateState();
      onClose();
      router.refresh();
    } catch (error) {
      setIsCreatingNested(false);
      const message = error instanceof Error ? error.message : "Error al crear el deal";
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
          <DialogTitle>Nuevo Deal</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="deal-title">Titulo *</Label>
            <Input id="deal-title" {...register("title")} placeholder="Ej: Servicio Premium - Empresa X" />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="deal-value">Valor ({settings.currency})</Label>
              <Input
                id="deal-value"
                type="number"
                step="0.01"
                {...register("value")}
                placeholder="0.00"
              />
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
            <Label>Contacto *</Label>
            <Select
              value={selectedContactId || ""}
              onValueChange={(v) => {
                if (!v) return;
                setValue("contactId", v, { shouldValidate: true });
              }}
            >
              <SelectTrigger className="cursor-pointer">
                <span className={selectedContactId ? "" : "text-muted-foreground"}>
                  {selectedContactId === CREATE_CONTACT_VALUE
                    ? "Crear nuevo contacto"
                    : contactsList.find((c) => c.id === selectedContactId)?.name ?? "Seleccionar contacto"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CREATE_CONTACT_VALUE}>+ Crear nuevo contacto</SelectItem>
                {contactsList.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.contactId && (
              <p className="text-xs text-destructive">{errors.contactId.message}</p>
            )}

            {selectedContactId === CREATE_CONTACT_VALUE && (
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
              {isCreatingNested ? "Creando contacto..." : isSubmitting ? "Creando..." : "Crear Deal"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
