"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/EmptyState";
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

function LeadCandidateCard({
  lead,
  onDecisionMade,
}: {
  lead: LeadCandidate;
  onDecisionMade: () => void;
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
        projectId: lead.projectId ?? undefined,
      };
    }

    try {
      const res = await fetch(`/api/lead-candidates/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data?.error?.message ?? "No se pudo procesar el lead");
        setSubmitting(false);
        return;
      }
      onDecisionMade();
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
  if (leads.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Bandeja vacía"
        description="No hay leads pendientes de revisión por ahora. Cuando el detector encuentre algo en mail o WhatsApp, aparecerá aquí."
      />
    );
  }

  return (
    <div className="space-y-4">
      {leads.map((lead) => (
        <LeadCandidateCard
          key={lead.id}
          lead={lead}
          onDecisionMade={onDecisionMade}
        />
      ))}
    </div>
  );
}
