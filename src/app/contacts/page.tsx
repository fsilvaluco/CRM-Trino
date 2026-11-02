"use client";

import { useState, useEffect } from "react";
import { ContactsTable } from "@/components/contacts/ContactsTable";
import { ContactForm } from "@/components/contacts/ContactForm";
import { DuplicateContactsDialog } from "@/components/contacts/DuplicateContactsDialog";
import { Button } from "@/components/ui/button";
import { Plus, Copy } from "lucide-react";
import type { Contact } from "@/types";
import { useProject } from "@/lib/project-context";
import { toast } from "sonner";
import { LoadErrorState, readLoadError } from "@/components/shared/LoadErrorState";

const LOAD_ERROR_FALLBACK =
  "No se pudieron cargar los contactos. Revisa tu conexión e inténtalo de nuevo.";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { activeProject, isAllProjects } = useProject();

  const loadContacts = () => {
    const params = activeProject ? `?projectId=${activeProject.id}` : "";
    fetch(`/api/contacts${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await readLoadError(res, LOAD_ERROR_FALLBACK));
        return res.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error(LOAD_ERROR_FALLBACK);
        setContacts(data);
        setLoadError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error && err.message ? err.message : LOAD_ERROR_FALLBACK);
        setLoading(false);
      });
  };

  const openNewContact = () => {
    if (isAllProjects) {
      toast.warning("Selecciona un proyecto para crear un contacto");
      return;
    }
    setShowForm(true);
  };

  useEffect(() => {
    loadContacts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject]);

  const handleCloseForm = () => {
    setShowForm(false);
    loadContacts();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contactos</h1>
          <p className="text-muted-foreground">
            Gestiona tus leads y prospectos
          </p>
        </div>
        <div className="flex-wrap flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowDuplicates(true)}
            className="cursor-pointer"
          >
            <Copy className="h-4 w-4 mr-2" />
            Quitar duplicados
          </Button>
          <Button
            onClick={openNewContact}
            className="cursor-pointer"
            disabled={isAllProjects}
            title={isAllProjects ? "Selecciona un proyecto para crear un contacto" : undefined}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Contacto
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : loadError ? (
        <LoadErrorState
          message={loadError}
          onRetry={() => {
            setLoading(true);
            loadContacts();
          }}
        />
      ) : (
        <ContactsTable
          contacts={contacts}
          onAddContact={isAllProjects ? undefined : openNewContact}
        />
      )}

      <ContactForm open={showForm} onClose={handleCloseForm} />
      <DuplicateContactsDialog
        open={showDuplicates}
        onClose={() => setShowDuplicates(false)}
        onMerged={loadContacts}
        projectId={activeProject?.id}
      />
    </div>
  );
}
