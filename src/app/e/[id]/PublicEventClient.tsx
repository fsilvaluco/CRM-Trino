"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, MapPin, Clock, Music4, FileText, Users, Navigation } from "lucide-react";

interface PublicTimingItem {
  id: string;
  timeLabel: string | null;
  activity: string;
  responsable: string | null;
  notes: string | null;
}

interface PublicSetlistItem {
  id: string;
  title: string;
}

interface PublicContact {
  id: string;
  role: string | null;
  name: string;
  phone: string | null;
}

interface PublicEvent {
  name: string;
  date: string;
  eventTime: string | null;
  venue: string;
  address: string | null;
  city: string | null;
  status: string;
  riderLocal: string | null;
  riderBanda: string | null;
  projectName: string | null;
  projectAvatarUrl: string | null;
  timing: PublicTimingItem[];
  setlist: PublicSetlistItem[];
  contacts: PublicContact[];
}

function formatDate(d: string) {
  try {
    return format(new Date(`${d}T00:00:00`), "EEEE d MMM yyyy", { locale: es });
  } catch {
    return d;
  }
}

function formatShortAddress(address: string | null, city: string | null): string | null {
  const street = address?.split(",")[0]?.trim() || "";
  const parts = [street, city].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function PublicEventClient({ id }: { id: string }) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/public/eventos/${id}`)
      .then((r) => {
        if (!r.ok) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setEvent(data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-white text-center px-4">
        <p className="text-muted-foreground">Este link no existe o el evento fue eliminado.</p>
      </div>
    );
  }

  const addressLine = formatShortAddress(event.address, event.city);
  const mapsQuery = event.address || [event.venue, event.city].filter(Boolean).join(", ");
  const mapsUrl = mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}` : null;

  return (
    <div className="min-h-screen w-full bg-white text-slate-900">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Marca chica arriba, ademas del pie de pagina */}
        <div className="flex justify-end">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.png" alt="" className="h-3.5 w-3.5 opacity-60" />
            Artist Pro
          </span>
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
          {event.projectAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.projectAvatarUrl} alt="" className="h-12 w-12 rounded-full object-cover shrink-0" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-600 shrink-0">
              {event.projectName?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <div className="min-w-0">
            {event.projectName && <p className="text-xs uppercase tracking-wide text-slate-500">{event.projectName}</p>}
            <h1 className="text-xl font-bold leading-tight">{event.name}</h1>
            <p className="text-sm text-slate-500 flex items-center gap-1.5 flex-wrap">
              <span className="capitalize">{formatDate(event.date)}</span>
              {event.eventTime && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {event.eventTime}
                </span>
              )}
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {event.venue}
              </span>
            </p>
            {addressLine && mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-xs text-primary hover:underline"
              >
                <Navigation className="h-3 w-3" />
                {addressLine}
              </a>
            )}
          </div>
        </div>

        {/* Contactos importantes -- solo los marcados para compartir */}
        {event.contacts.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
              <Users className="h-4 w-4" />
              Contactos importantes
            </h2>
            <div className="space-y-1.5">
              {event.contacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 text-sm border-b border-slate-100 pb-1.5">
                  <div className="min-w-0">
                    <span className="font-medium">{c.name}</span>
                    {c.role && <span className="text-slate-500"> — {c.role}</span>}
                  </div>
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="text-primary shrink-0 whitespace-nowrap">
                      {c.phone}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timing */}
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <Clock className="h-4 w-4" />
            Timing / Cronograma
          </h2>
          {event.timing.length === 0 ? (
            <p className="text-sm text-slate-400">Sin timing cargado todavía.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="text-left py-1.5 pr-3 font-medium text-slate-500">Hora</th>
                  <th className="text-left py-1.5 pr-3 font-medium text-slate-500">Detalle</th>
                  <th className="text-left py-1.5 pr-3 font-medium text-slate-500">Responsable</th>
                  <th className="text-left py-1.5 font-medium text-slate-500">Notas</th>
                </tr>
              </thead>
              <tbody>
                {event.timing.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{item.timeLabel || "—"}</td>
                    <td className="py-1.5 pr-3">{item.activity}</td>
                    <td className="py-1.5 pr-3">{item.responsable || "—"}</td>
                    <td className="py-1.5">{item.notes || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Setlist */}
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
            <Music4 className="h-4 w-4" />
            Setlist
          </h2>
          {event.setlist.length === 0 ? (
            <p className="text-sm text-slate-400">Sin setlist cargado todavía.</p>
          ) : (
            <ol className="list-decimal pl-5 space-y-1 text-sm">
              {event.setlist.map((song) => <li key={song.id}>{song.title}</li>)}
            </ol>
          )}
        </div>

        {/* Riders -- solo si hay alguno cargado */}
        {(event.riderLocal || event.riderBanda) && (
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
              <FileText className="h-4 w-4" />
              Riders
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {event.riderLocal && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Rider local (venue)</p>
                  <p className="text-sm whitespace-pre-wrap text-slate-700">{event.riderLocal}</p>
                </div>
              )}
              {event.riderBanda && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Rider banda</p>
                  <p className="text-sm whitespace-pre-wrap text-slate-700">{event.riderBanda}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-4 border-t border-slate-200 text-slate-400">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icon.png" alt="" className="h-4 w-4 opacity-60" />
          <p className="text-[11px]">Compartido con Artist Pro</p>
        </div>
      </div>
    </div>
  );
}
