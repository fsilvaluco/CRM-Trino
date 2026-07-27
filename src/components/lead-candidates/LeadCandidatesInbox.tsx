"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { DealForm } from "@/components/deals/DealForm";
import { TaskForm } from "@/components/tasks/TaskForm";
import { Inbox, Mail, MessageCircle, Check, X, Pencil } from "lucide-react";
import { formatDate } from "@/lib/constants";
import { toast } from "sonner";
import type { LeadCandidate } from "@/types";

interface LeadCandidatesInboxProps {
  leads: LeadCandidate[];
  onDecisionMade: () => void;
}

const SOURCE_META: Record<
  LeadCandidate["source"],
  { label: string; icon: typeof Mail }
> = {
  email: { label: "Email", icon: Mail },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
};

interface ExistingContactMatch {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface SuggestedDeal {
  contactId: string;
  companyId: string | null;
  projectId: string | null;
  artistProjectId: string | null;
  title: string;
  notes: string;
}

interface SuggestedTask {
  contactId: string;
  companyId: string | null;
  projectId: string | null;
  title: string;
  description: string;
  dueDate: string;
}

interface ExistingOpenTask {
  id: string;
  title: string;
}

interface ApprovalResult {
  itemType: "deal" | "task" | "both";
  suggestedDeal: SuggestedDeal;
  suggestedTask: SuggestedTask;
  existingOpenTasks: ExistingOpenTask[];
  taskUpdate: { summary: string; authorName: string };
}

interface DuplicatePrompt {
  leadId: string;
  overrides: Record<string, unknown>;
  existingContact: ExistingContactMatch;
}

function LeadCandidateCard({
  lead,
  onApproved,
  onDuplicateFound,
  onRejected,
}: {
  lead: LeadCandidate;
  onApproved: (result: ApprovalResult) => void;
  onDuplicateFound: (prompt: DuplicatePrompt) => void;
  onRejected: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(lead.detectedName ?? "");
  const [email, setEmail] = useState(lead.detectedEmail ?? "");
  const [phone, setPhone] = useState(lead.detectedPhone ?? "");
  const [companyName, setCompanyName] = useState(lead.detectedCompany ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const SourceIcon = SOURCE_META[lead.source].icon;

  async function handleDecision(action: "approve" | "reject") {
    setSubmitting(true);
    setErrorMsg(null);

    const payload: Record<string, unknown> = { action };
    if (action === "approve") {
      payload.overrides = {
        name: name.trim() || undefined,
        email: email.trim() || null,
        phone: phone.trim() || null,
        companyName: companyName.trim() || null,
        projectId: lead.artistProjectId ?? lead.projectId ?? undefined,
      };
    }

    try {
      const res = await fetch(`/api/lead-candidates/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.status === 409 && data?.requiresDuplicateResolution) {
        onDuplicateFound({
          leadId: lead.id,
          overrides: payload.overrides as Record<string, unknown>,
          existingContact: data.existingContact,
        });
        setSubmitting(false);
        return;
      }

      if (!res.ok) {
        setErrorMsg(data?.error?.message ?? "No se pudo procesar el lead");
        setSubmitting(false);
        return;
      }

      if (action === "approve") {
        onApproved({
          itemType: data.itemType,
          suggestedDeal: data.suggestedDeal,
          suggestedTask: data.suggestedTask,
          existingOpenTasks: data.existingOpenTasks ?? [],
          taskUpdate: data.taskUpdate,
        });
      } else {
        onRejected();
      }
    } catch {
      setErrorMsg("Error de red, intenta de nuevo");
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <SourceIcon className="h-3 w-3" />
            {SOURCE_META[lead.source].label}
          </Badge>
          <Badge
            className={
              lead.itemType === "task"
                ? "bg-sky-100 text-sky-800 hover:bg-sky-100"
                : lead.itemType === "both"
                  ? "bg-violet-100 text-violet-800 hover:bg-violet-100"
                  : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
            }
          >
            {lead.itemType === "task" ? "Tarea" : lead.itemType === "both" ? "Trato + Tarea" : "Trato"}
          </Badge>
          {lead.signalReason && (
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
              {lead.signalReason}
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDate(lead.createdAt)}
        </span>
      </CardHeader>

      <CardContent className="space-y-4">
        <blockquote className="text-sm text-muted-foreground border-l-2 pl-3 italic">
          &ldquo;{lead.rawExcerpt}&rdquo;
        </blockquote>

        {!editing ? (
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-medium">{name || "Sin nombre detectado"}</span>
            {email && <span className="text-muted-foreground">{email}</span>}
            {phone && <span className="text-muted-foreground">{phone}</span>}
            {companyName && (
              <span className="text-muted-foreground">· {companyName}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 cursor-pointer"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3 w-3 mr-1" />
              Editar
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Empresa</Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Teléfono</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
        )}

        {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="cursor-pointer"
            disabled={submitting}
            onClick={() => handleDecision("approve")}
          >
            <Check className="h-4 w-4 mr-1" />
            Aprobar y crear contacto
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="cursor-pointer"
            disabled={submitting}
            onClick={() => handleDecision("reject")}
          >
            <X className="h-4 w-4 mr-1" />
            Descartar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function LeadCandidatesInbox({
  leads,
  onDecisionMade,
}: LeadCandidatesInboxProps) {
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicatePrompt | null>(null);
  const [resolvingDuplicate, setResolvingDuplicate] = useState(false);
  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [dealPrefill, setDealPrefill] = useState<SuggestedDeal | null>(null);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskPrefill, setTaskPrefill] = useState<SuggestedTask | null>(null);
  const [chooserResult, setChooserResult] = useState<ApprovalResult | null>(null);

  function openDealFormFor(deal: SuggestedDeal) {
    setDealPrefill(deal);
    setDealFormOpen(true);
  }

  function openTaskFormFor(task: SuggestedTask) {
    setTaskPrefill(task);
    setTaskFormOpen(true);
  }

  function handleApproved(result: ApprovalResult) {
    onDecisionMade(); // saca la card ya aprobada de la lista

    const hasDeal = result.itemType === "deal" || result.itemType === "both";
    const hasTask = result.itemType === "task" || result.itemType === "both";
    const hasExistingTasks = hasTask && result.existingOpenTasks.length > 0;

    if (hasDeal && !hasTask) {
      openDealFormFor(result.suggestedDeal);
    } else if (hasTask && !hasDeal && !hasExistingTasks) {
      openTaskFormFor(result.suggestedTask);
    } else {
      // Necesita elegir: "both", o una tarea que podria ser actualizacion
      // de algo que ya se estaba siguiendo con este mismo contacto.
      setChooserResult(result);
    }
  }

  async function handleTaskUpdate(taskId: string, result: ApprovalResult) {
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: result.taskUpdate.summary,
          author: result.taskUpdate.authorName,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo agregar la actualizacion a la tarea");
        return;
      }
      toast.success("Actualización agregada a la tarea");
      setChooserResult(null);
    } catch {
      toast.error("Error de red al actualizar la tarea");
    }
  }

  async function resolveDuplicate(action: "update_existing" | "create_new") {
    if (!duplicatePrompt) return;
    setResolvingDuplicate(true);
    try {
      const res = await fetch(`/api/lead-candidates/${duplicatePrompt.leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          overrides: duplicatePrompt.overrides,
          duplicateAction: action,
        }),
      });
      const data = await res.json();
      if (!res.ok) return;
      setDuplicatePrompt(null);
      handleApproved({
        itemType: data.itemType,
        suggestedDeal: data.suggestedDeal,
        suggestedTask: data.suggestedTask,
        existingOpenTasks: data.existingOpenTasks ?? [],
        taskUpdate: data.taskUpdate,
      });
    } finally {
      setResolvingDuplicate(false);
    }
  }

  return (
    <>
      {leads.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Bandeja vacía"
          description="No hay leads pendientes de revisión por ahora. Cuando el detector encuentre algo en mail o WhatsApp, aparecerá aquí."
        />
      ) : (
        <div className="space-y-4">
          {leads.map((lead) => (
            <LeadCandidateCard
              key={lead.id}
              lead={lead}
              onApproved={handleApproved}
              onDuplicateFound={setDuplicatePrompt}
              onRejected={onDecisionMade}
            />
          ))}
        </div>
      )}

      <Dialog open={!!duplicatePrompt} onOpenChange={(v) => !v && setDuplicatePrompt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ya existe un contacto parecido</DialogTitle>
            <DialogDescription>
              Encontramos un contacto con el mismo email o teléfono:{" "}
              <span className="font-medium text-foreground">
                {duplicatePrompt?.existingContact.name}
              </span>{" "}
              ({duplicatePrompt?.existingContact.email || duplicatePrompt?.existingContact.phone})
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              className="cursor-pointer"
              disabled={resolvingDuplicate}
              onClick={() => resolveDuplicate("update_existing")}
            >
              Actualizar ese contacto existente
            </Button>
            <Button
              variant="outline"
              className="cursor-pointer"
              disabled={resolvingDuplicate}
              onClick={() => resolveDuplicate("create_new")}
            >
              Crear un contacto nuevo de todas formas
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cuando hay que elegir: trato vs tarea, o actualizar una tarea existente vs crear nueva */}
      <Dialog open={!!chooserResult} onOpenChange={(v) => !v && setChooserResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Qué quieres hacer con este correo?</DialogTitle>
            <DialogDescription>
              {chooserResult && chooserResult.existingOpenTasks.length > 0
                ? "Encontramos tareas abiertas con este mismo contacto -- puede ser el avance de algo que ya se estaba siguiendo."
                : "Este correo sugiere tanto una oportunidad de negocio como una tarea de seguimiento."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            {chooserResult && (chooserResult.itemType === "deal" || chooserResult.itemType === "both") && (
              <Button
                className="cursor-pointer justify-start"
                onClick={() => {
                  openDealFormFor(chooserResult.suggestedDeal);
                  setChooserResult(null);
                }}
              >
                Agregar trato: &ldquo;{chooserResult.suggestedDeal.title}&rdquo;
              </Button>
            )}

            {chooserResult &&
              (chooserResult.itemType === "task" || chooserResult.itemType === "both") &&
              chooserResult.existingOpenTasks.map((t) => (
                <Button
                  key={t.id}
                  variant="outline"
                  className="cursor-pointer justify-start"
                  onClick={() => handleTaskUpdate(t.id, chooserResult)}
                >
                  Actualización de tarea: &ldquo;{t.title}&rdquo;
                </Button>
              ))}

            {chooserResult && (chooserResult.itemType === "task" || chooserResult.itemType === "both") && (
              <Button
                variant="outline"
                className="cursor-pointer justify-start"
                onClick={() => {
                  openTaskFormFor(chooserResult.suggestedTask);
                  setChooserResult(null);
                }}
              >
                Crear tarea nueva: &ldquo;{chooserResult.suggestedTask.title}&rdquo;
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <DealForm
        open={dealFormOpen}
        onClose={() => {
          setDealFormOpen(false);
          setDealPrefill(null);
        }}
        prefill={dealPrefill ?? undefined}
      />

      <TaskForm
        open={taskFormOpen}
        onClose={() => {
          setTaskFormOpen(false);
          setTaskPrefill(null);
        }}
        preselectedContactId={taskPrefill?.contactId}
        preselectedCompanyId={taskPrefill?.companyId ?? undefined}
        preselectedProjectId={taskPrefill?.projectId ?? undefined}
        prefillTitle={taskPrefill?.title}
        prefillDescription={taskPrefill?.description}
        prefillDueDate={taskPrefill?.dueDate}
      />
    </>
  );
}
