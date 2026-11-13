"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/shared/ConfirmProvider";
import type { EventDetail } from "../types";

// Cierre de caja de la Planilla: cerrar/reabrir, mandar el acta, quitar el
// documento adjunto y descargar la planilla.
export function useCostClosing({
  id,
  event,
  costsDirty,
  reload,
}: {
  id: string;
  event: EventDetail | null;
  costsDirty: boolean;
  reload: () => void;
}) {
  const confirm = useConfirm();
  const [closing, setClosing] = useState(false);
  const [informing, setInforming] = useState(false);

  async function close() {
    if (costsDirty) {
      toast.error("Guarda los costos primero antes de cerrar la caja");
      return;
    }
    if (
      !(await confirm({
        title: "¿Cerrar la caja de este evento?",
        description: "Los costos quedarán de solo lectura hasta que la reabras.",
        confirmLabel: "Cerrar caja",
        destructive: false,
      }))
    )
      return;
    setClosing(true);
    try {
      const res = await fetch(`/api/eventos/${id}/costs/close`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("Caja cerrada");
      reload();
    } catch {
      toast.error("No se pudo cerrar la caja");
    } finally {
      setClosing(false);
    }
  }

  async function reopen() {
    setClosing(true);
    try {
      const res = await fetch(`/api/eventos/${id}/costs/reopen`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("Caja reabierta");
      reload();
    } catch {
      toast.error("No se pudo reabrir la caja");
    } finally {
      setClosing(false);
    }
  }

  // Manda el resumen del cierre por correo a todos los que firmaron --
  // solo se puede llamar cuando allSigned es true (el botón que lo dispara
  // ya está deshabilitado antes de eso, pero el servidor lo revalida igual).
  // No es de un solo uso: se puede volver a apretar para reenviar.
  async function inform() {
    const already = Boolean(event?.costSheetInformedAt);
    if (
      !(await confirm(
        already
          ? {
              title: "¿Reenviar el acta del cierre?",
              description: "Se envía de nuevo por correo a todos los que firmaron.",
              confirmLabel: "Reenviar acta",
              destructive: false,
            }
          : {
              title: "¿Mandar el acta del cierre?",
              description:
                "Va por correo a todos los que firmaron, con el resumen y el PDF de todas las firmas. Normalmente sale sola cuando termina de firmar todo el mundo; esto sirve para adelantarla.",
              confirmLabel: "Mandar acta",
              destructive: false,
            }
      ))
    )
      return;
    setInforming(true);
    try {
      const res = await fetch(`/api/eventos/${id}/costs/inform`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo enviar el acta");
      toast.success(`Acta enviada a ${data.sentTo?.length ?? 0} persona(s)`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar el acta");
    } finally {
      setInforming(false);
    }
  }

  async function removeAttachment() {
    if (
      !(await confirm({
        title: "¿Quitar el documento adjunto del cierre?",
        confirmLabel: "Quitar documento",
      }))
    )
      return;
    try {
      const res = await fetch(`/api/eventos/${id}/costs/attachment`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Documento quitado");
      reload();
    } catch {
      toast.error("No se pudo quitar el documento");
    }
  }

  // El nombre del archivo lo pone el Content-Disposition del endpoint; el <a>
  // temporal es para no navegar fuera de la página al descargar.
  function download(fileFormat: "csv" | "pdf") {
    const link = document.createElement("a");
    link.href = `/api/eventos/${id}/costs/export?format=${fileFormat}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return { closing, informing, close, reopen, inform, removeAttachment, download };
}

export type CostClosingState = ReturnType<typeof useCostClosing>;
