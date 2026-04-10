"use client";

import { useState, useEffect } from "react";
import { ContactsTable } from "@/components/contacts/ContactsTable";
import { ContactForm } from "@/components/contacts/ContactForm";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { Contact } from "@/types";
import { useProject } from "@/lib/project-context";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const { activeProject } = useProject();

  const loadContacts = () => {
    const params = activeProject ? `?projectId=${activeProject.id}` : "";
    fetch(`/api/contacts${params}`)
      .then((res) => res.json())
      .then((data) => {
        setContacts(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contactos</h1>
          <p className="text-muted-foreground">
            Gestiona tus leads y prospectos
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} className="cursor-pointer">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Contacto
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <ContactsTable contacts={contacts} />
      )}

      <ContactForm open={showForm} onClose={handleCloseForm} />
    </div>
  );
}
