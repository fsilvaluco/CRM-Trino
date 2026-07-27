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
import { Inbox, Mail, MessageCircle, Check, X, Pencil } from "lucide-react";
import { formatDate } from "@/lib/constants";
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
  onApproved: (deal: SuggestedDeal) => void;
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
        onApproved(data.suggestedDeal);
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

  function openDealFormFor(deal: SuggestedDeal) {
    setDealPrefill(deal);
    setDealFormOpen(true);
    onDecisionMade(); // saca la card ya aprobada de la lista
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
      openDealFormFor(data.suggestedDeal);
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
              onApproved={openDealFormFor}
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

      <DealForm
        open={dealFormOpen}
        onClose={() => {
          setDealFormOpen(false);
          setDealPrefill(null);
        }}
        prefill={
          dealPrefill
            ? {
                contactId: dealPrefill.contactId,
                companyId: dealPrefill.companyId,
                title: dealPrefill.title,
                notes: dealPrefill.notes,
                projectId: dealPrefill.projectId,
                artistProjectId: dealPrefill.artistProjectId,
              }
            : undefined
        }
      />
    </>
  );
}
