"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, MapPin, Clock, Music4, FileText, Users, Navigation, Phone } from "lucide-react";

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
          <a
            href="https://artistpro.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-600"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.png" alt="" className="h-3.5 w-3.5 opacity-60" />
            Artist Pro
          </a>
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
                    <div className="text-right shrink-0">
                      <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="text-primary whitespace-nowrap">
                        {c.phone}
                      </a>
                      <div className="flex items-center justify-end gap-2 mt-0.5">
                        <a
                          href={`https://wa.me/${c.phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Escribir por WhatsApp"
                          className="text-slate-400 hover:text-green-600"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                            <path d="M17.6 6.32A8.86 8.86 0 0 0 12.05 4C7.14 4 3.15 7.94 3.15 12.8c0 1.62.44 3.14 1.2 4.46L3 21l3.87-1.28a8.9 8.9 0 0 0 5.18 1.63h.01c4.9 0 8.9-3.94 8.9-8.8 0-2.35-.94-4.55-2.36-6.23ZM12.06 19.9a7.4 7.4 0 0 1-4.36-1.4l-.32-.19-3.06 1 1.02-2.93-.2-.32a7.28 7.28 0 0 1-1.13-3.9c0-4.03 3.32-7.3 7.4-7.3a7.4 7.4 0 0 1 5.24 2.15 7.13 7.13 0 0 1 2.16 5.06c0 4.03-3.32 7.3-7.4 7.3Zm4.05-5.46c-.22-.11-1.3-.63-1.5-.71-.2-.07-.35-.11-.5.11-.14.22-.57.71-.7.86-.13.14-.26.15-.48.05-.22-.11-.94-.34-1.79-1.1-.66-.58-1.11-1.31-1.24-1.53-.13-.22-.01-.34.11-.45.11-.11.25-.28.37-.42.12-.14.16-.25.24-.4.08-.15.04-.29-.02-.4-.06-.11-.5-1.19-.68-1.63-.18-.44-.36-.38-.5-.38-.13 0-.28-.01-.43-.01-.15 0-.39.06-.6.28-.2.22-.78.75-.78 1.83s.8 2.12.91 2.27c.11.14 1.51 2.31 3.68 3.15 1.84.71 2.21.6 2.61.56.4-.04 1.3-.53 1.48-1.04.18-.51.18-.94.13-1.03-.05-.09-.19-.15-.41-.26Z" />
                          </svg>
                        </a>
                        <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} title="Llamar" className="text-slate-400 hover:text-primary">
                          <Phone className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
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

        <a
          href="https://artistpro.app"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 pt-4 border-t border-slate-200 text-slate-400 hover:text-slate-600"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icon.png" alt="" className="h-4 w-4 opacity-60" />
          <p className="text-[11px]">Compartido con Artist Pro</p>
        </a>
      </div>
    </div>
  );
}
