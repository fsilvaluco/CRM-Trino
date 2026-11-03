"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { DirtyRef, EventDetail } from "../types";

// "Detalles" del evento: link, riders y el link de la ticketera. El link de
// la ticketera se edita en la sección Entradas pero se guarda acá (y también
// lo guarda Sincronizar), así que vive en este grupo igual que antes.
export function useDetailsSection({ eventApiUrl, dirtyRef }: { eventApiUrl: string; dirtyRef: DirtyRef }) {
  const [eventLink, setEventLink] = useState("");
  const [riderLocal, setRiderLocal] = useState("");
  const [riderBanda, setRiderBanda] = useState("");
  const [ticketSalesUrl, setTicketSalesUrl] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const hydrate = useCallback(
    (data: EventDetail) => {
      if (dirtyRef.current.details) return;
      setEventLink(data.eventLink ?? "");
      setRiderLocal(data.riderLocal ?? "");
      setRiderBanda(data.riderBanda ?? "");
      setTicketSalesUrl(data.ticketSalesUrl ?? "");
      setDirty(false);
    },
    [dirtyRef]
  );

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(eventApiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventLink: eventLink || null, riderLocal: riderLocal || null, riderBanda: riderBanda || null, ticketSalesUrl: ticketSalesUrl || null }),
      });
      if (!res.ok) throw new Error();
      toast.success("Guardado");
      setDirty(false);
    } catch {
      toast.error("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return {
    eventLink, setEventLink, riderLocal, setRiderLocal, riderBanda, setRiderBanda,
    ticketSalesUrl, setTicketSalesUrl,
    dirty, setDirty, saving, save, hydrate,
  };
}

export type DetailsSectionState = ReturnType<typeof useDetailsSection>;
