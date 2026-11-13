"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { EventContact } from "@/types/shows";
import type { DirtyRef, EventDetail } from "../types";
import { newId } from "../utils";

// Estado y acciones de la sección Contactos importantes.
export function useContactsSection({ id, dirtyRef, reload }: { id: string; dirtyRef: DirtyRef; reload: () => void }) {
  const [eventContacts, setEventContacts] = useState<EventContact[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [newName, setNewName] = useState("");
  const [newContactId, setNewContactId] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState("");

  const hydrate = useCallback(
    (data: EventDetail) => {
      if (dirtyRef.current.contacts) return;
      setEventContacts(data.eventContacts ?? []);
      setDirty(false);
    },
    [dirtyRef]
  );

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/eventos/${id}/contacts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: eventContacts.map((c) => ({
            id: c.id.startsWith("tmp-") ? undefined : c.id,
            role: c.role,
            name: c.name,
            contactId: c.contactId,
            phone: c.phone,
            visibleOnShare: c.visibleOnShare,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Contactos guardados");
      setDirty(false);
      dirtyRef.current.contacts = false;
      reload();
    } catch {
      toast.error("No se pudieron guardar los contactos");
    } finally {
      setSaving(false);
    }
  }

  function edit(updater: (prev: EventContact[]) => EventContact[]) {
    setEventContacts(updater);
    setDirty(true);
  }

  function addContact() {
    setEventContacts((prev) => [
      ...prev,
      {
        id: `tmp-${newId()}`,
        position: prev.length,
        role: newRole || null,
        name: newName.trim(),
        contactId: newContactId,
        phone: newPhone || null,
        visibleOnShare: false,
      },
    ]);
    setNewRole("");
    setNewName("");
    setNewContactId(null);
    setNewPhone("");
    setDirty(true);
  }

  return {
    eventContacts, dirty, saving, save, edit, addContact,
    newRole, setNewRole, newName, setNewName, setNewContactId, newPhone, setNewPhone,
    hydrate,
  };
}

export type ContactsSectionState = ReturnType<typeof useContactsSection>;
