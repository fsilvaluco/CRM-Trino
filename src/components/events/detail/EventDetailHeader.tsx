"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Pencil, MapPin, Clock, Star, Loader2, Printer, Share2, BellRing } from "lucide-react";
import type { EventDetail, PrintSection } from "./types";
import { formatDate, getStatusConfig } from "./utils";

// Encabezado en pantalla del evento: volver, acciones (compartir, notificar,
// valoración, imprimir, editar), nombre, estado, fecha y lugar.
export function EventDetailHeader({
  id,
  event,
  onEdit,
  printSection,
}: {
  id: string;
  event: EventDetail;
  onEdit: () => void;
  printSection: (section: PrintSection) => void;
}) {
  const router = useRouter();
  const [notifyingChange, setNotifyingChange] = useState(false);

  async function handleCopyShareLink() {
    const url = `${window.location.origin}/e/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado -- se puede abrir sin cuenta (ve encabezado, timing, setlist y riders)");
    } catch {
      toast.info(url);
    }
  }

  async function handleCopyRatingLink() {
    const url = `${window.location.origin}/rate/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado -- mándaselo a quien tocó");
    } catch {
      toast.info(url);
    }
  }

  async function handleNotifyChanges() {
    setNotifyingChange(true);
    try {
      const res = await fetch(`/api/eventos/${id}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo notificar");
      if (data.notified === 0) {
        toast.info("Nadie más en el proyecto tiene notificaciones activadas todavía");
      } else {
        toast.success(`Notificación enviada a ${data.notified} persona${data.notified === 1 ? "" : "s"} del proyecto`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al notificar");
    } finally {
      setNotifyingChange(false);
    }
  }

  return (
    <>
      <button
        onClick={() => router.push("/eventos")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer no-print"
      >
        <ArrowLeft className="h-4 w-4" />
        Eventos
      </button>

      <div className="flex flex-col gap-3 no-print">
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={handleCopyShareLink} title="Compartir">
            <Share2 className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Compartir</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="cursor-pointer"
            onClick={handleNotifyChanges}
            disabled={notifyingChange}
            title="Avisar al proyecto que algo cambió en este evento"
          >
            {notifyingChange ? <Loader2 className="h-4 w-4 sm:mr-1.5 animate-spin" /> : <BellRing className="h-4 w-4 sm:mr-1.5" />}
            <span className="hidden sm:inline">Notificar cambios</span>
          </Button>
          {event.status === "realizado" && (
            <Button size="sm" variant="outline" className="cursor-pointer" onClick={handleCopyRatingLink} title="Link de valoración">
              <Star className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">Link de valoración</span>
            </Button>
          )}
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => printSection("todo")} title="Imprimir todo">
            <Printer className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Imprimir todo</span>
          </Button>
          <Button size="sm" variant="outline" className="cursor-pointer" onClick={onEdit} title="Editar">
            <Pencil className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Editar</span>
          </Button>
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight leading-tight">{event.name}</h1>
            <Badge variant="secondary" className={`text-xs ${getStatusConfig(event.status).className}`}>
              {getStatusConfig(event.status).label}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
            <span className="capitalize">{formatDate(event.date)}</span>
            {event.eventTime && (
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{event.eventTime}</span>
            )}
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {event.venue}{event.city ? `, ${event.city}` : ""}
            </span>
            {event.projectName && <Badge variant="outline" className="text-xs">{event.projectName}</Badge>}
          </div>
        </div>
      </div>
    </>
  );
}
