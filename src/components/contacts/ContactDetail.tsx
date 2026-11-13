"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContactForm } from "./ContactForm";
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  Calendar,
  Pencil,
  Trash2,
  MessageCircle,
  Copy,
  Check,
} from "lucide-react";
import { cleanPhoneForWhatsApp } from "@/lib/constants";
import { useLocale } from "@/lib/locale-context";
import { SOURCE_LABELS } from "@/lib/constants";
import { toast } from "sonner";
import type { LeadSource } from "@/types";
import { useConfirm } from "@/components/shared/ConfirmProvider";
import { useProject } from "@/lib/project-context";


interface ContactDetailClientProps {
  contact: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    companyId: string | null;
    source: string;
    score: number;
    notes: string | null;
    createdAt: number | Date;
  };
  deals: Array<{
    id: string;
    title: string;
    value: number;
    probability: number;
    stageName: string | null;
    stageColor: string | null;
    createdAt: number | Date;
  }>;
}

export function ContactDetailClient({
  contact,
  deals,
}: ContactDetailClientProps) {
  const confirm = useConfirm();
  const router = useRouter();
  const { formatCurrency, formatDate } = useLocale();
  // Misma regla que PUT/DELETE /api/contacts/[id] (matriz `contactos`).
  const { canEditModuleInActiveProject, canDeleteModuleInActiveProject } = useProject();
  const canEditContact = canEditModuleInActiveProject("contactos");
  const canDeleteContact = canDeleteModuleInActiveProject("contactos");
  const [showEditForm, setShowEditForm] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (value: string, field: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      toast.success("Copiado");
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Error al copiar");
    }
  };

  const handleDelete = async () => {
    if (
      !(await confirm({
        title: "¿Seguro que quieres eliminar este contacto?",
        description: "Esta acción no se puede deshacer.",
        confirmLabel: "Eliminar contacto",
        destructive: true,
      }))
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al eliminar");
      toast.success("Contacto eliminado");
      router.push("/contacts");
    } catch {
      toast.error("Error al eliminar el contacto");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/contacts")}
          className="cursor-pointer"
          aria-label="Volver a contactos"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{contact.name}</h1>
          </div>
          <p className="text-muted-foreground">
            Score: {contact.score}/100 &middot;{" "}
            {SOURCE_LABELS[contact.source as LeadSource] || contact.source}
          </p>
        </div>
        <div className="flex gap-2">
          {canEditContact && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEditForm(true)}
              className="cursor-pointer"
            >
              <Pencil className="h-4 w-4 mr-1" />
              Editar
            </Button>
          )}
          {canDeleteContact && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              className="cursor-pointer text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Eliminar
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informacion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {contact.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`mailto:${contact.email}`} className="text-primary hover:underline flex-1 truncate">
                  {contact.email}
                </a>
                <button aria-label="Copiar email"
                  onClick={() => handleCopy(contact.email!, "email")}
                  className="p-1 rounded hover:bg-muted cursor-pointer"
                  title="Copiar email"
                >
                  {copiedField === "email" ? (
                    <Check aria-hidden="true" className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <Copy aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1">{contact.phone}</span>
                <div className="flex items-center gap-1">
                  <a aria-label="Abrir WhatsApp (se abre en una pestaña nueva)"
                    href={`https://wa.me/${cleanPhoneForWhatsApp(contact.phone)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded hover:bg-green-50 cursor-pointer"
                    title="Abrir WhatsApp"
                  >
                    <MessageCircle aria-hidden="true" className="h-3.5 w-3.5 text-green-600" />
                  </a>
                  <a aria-label="Llamar"
                    href={`tel:${contact.phone}`}
                    className="p-1 rounded hover:bg-blue-50 cursor-pointer"
                    title="Llamar"
                  >
                    <Phone aria-hidden="true" className="h-3.5 w-3.5 text-blue-600" />
                  </a>
                  <button aria-label="Copiar teléfono"
                    onClick={() => handleCopy(contact.phone!, "phone")}
                    className="p-1 rounded hover:bg-muted cursor-pointer"
                    title="Copiar telefono"
                  >
                    {copiedField === "phone" ? (
                      <Check aria-hidden="true" className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>
            )}
            {(contact.company || contact.companyId) && (
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                {contact.companyId ? (
                  <a
                    href={`/companies/${contact.companyId}`}
                    className="text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {contact.company || "Empresa vinculada"}
                  </a>
                ) : (
                  <span>{contact.company}</span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Creado {formatDate(contact.createdAt)}</span>
            </div>
            {contact.notes && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground">{contact.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deals */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Deals ({deals.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {deals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin deals</p>
            ) : (
              <div className="space-y-3">
                {deals.map((deal) => (
                  <Link
                    key={deal.id}
                    href={`/deals/${deal.id}`}
                    className="block p-3 rounded-lg border hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <p className="text-sm font-medium">{deal.title}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-semibold text-primary">
                        {formatCurrency(deal.value)}
                      </span>
                      <Badge
                        variant="outline"
                        style={{
                          borderColor: deal.stageColor || undefined,
                          color: deal.stageColor || undefined,
                        }}
                      >
                        {deal.stageName}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ContactForm
        open={showEditForm}
        onClose={() => {
          setShowEditForm(false);
          router.refresh();
        }}
        initialData={{
          id: contact.id,
          name: contact.name,
          email: contact.email || "",
          phone: contact.phone || "",
          company: contact.company || "",
          companyId: contact.companyId || "",
          score: contact.score,
          source: contact.source,
          notes: contact.notes || "",
        }}
      />
    </div>
  );
}
