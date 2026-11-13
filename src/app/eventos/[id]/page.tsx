"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useProject } from "@/lib/project-context";
import { EventFormDialog } from "@/components/events/EventFormDialog";
import { ExternalSignersCard } from "@/components/events/ExternalSignersCard";
import { ApprovalCard } from "@/components/events/ApprovalCard";
import { EventPrintHeader } from "@/components/events/EventPrintHeader";
import { EventPrintFooter } from "@/components/events/EventPrintFooter";
import { format } from "date-fns";
import { useUnsavedChangesWarning } from "@/lib/hooks/use-unsaved-changes-warning";
import type { DirtyFlags, EventDetail, PrintSection, SignatureData } from "@/components/events/detail/types";
import { formatDate, formatShortAddress } from "@/components/events/detail/utils";
import { useSetlistSection } from "@/components/events/detail/hooks/useSetlistSection";
import { useTimingSection } from "@/components/events/detail/hooks/useTimingSection";
import { useContactsSection } from "@/components/events/detail/hooks/useContactsSection";
import { useDetailsSection } from "@/components/events/detail/hooks/useDetailsSection";
import { useTicketsSection } from "@/components/events/detail/hooks/useTicketsSection";
import { useCostsSection } from "@/components/events/detail/hooks/useCostsSection";
import { useCostClosing } from "@/components/events/detail/hooks/useCostClosing";
import { useCostSubmissions } from "@/components/events/detail/hooks/useCostSubmissions";
import { EventDetailHeader } from "@/components/events/detail/EventDetailHeader";
import { EventSummary } from "@/components/events/detail/EventSummary";
import { EventContactsSection } from "@/components/events/detail/EventContactsSection";
import { EventSetlistSection } from "@/components/events/detail/EventSetlistSection";
import { EventTimingSection } from "@/components/events/detail/EventTimingSection";
import { EventTicketsSection } from "@/components/events/detail/EventTicketsSection";
import { EventCostsSection } from "@/components/events/detail/costs/EventCostsSection";
import { EventRidersSection } from "@/components/events/detail/EventRidersSection";

// Página de detalle de un evento. Es el orquestador: carga el evento,
// reparte el estado a cada sección y concentra lo compartido (aviso de
// cambios sin guardar, impresión por sección, permisos, firmas).
//
// El estado de cada sección vive en su hook (components/events/detail/hooks)
// pero los hooks se llaman ACÁ y no dentro de cada sección: `load()` tiene
// que poder repoblar todas las secciones con lo que vuelve del servidor
// (`hydrate`) respetando las que tienen cambios sin guardar, y el aviso de
// "¿salir sin guardar?" necesita leer todas las banderas de dirty.
export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { projects, activeProject } = useProject();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ message: string; wrongProject: boolean } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [signatureData, setSignatureData] = useState<SignatureData | null>(null);

  // Bug real reportado por Francisco el 27 ago 2026 -- "se me ha borrado
  // el timing 5-6 veces": cambiar de pestaña (ej. a Maps) y volver dispara
  // en Supabase un refresh de sesión (evento SIGNED_IN re-emitido al
  // recuperar el foco, ver auth-context.tsx) que hace que project-context
  // vuelva a pedir la lista de proyectos. Eso genera un objeto `activeProject`
  // NUEVO aunque sea el mismo proyecto -- y como `load` dependía de ese
  // objeto completo (no de su id), se volvía a crear y disparaba un refetch
  // que pisaba TODO lo que la persona estaba escribiendo, incluido mostrar
  // el skeleton de carga encima del formulario a medio llenar.
  // Dos capas de arreglo:
  // 1. `load` depende de `activeProject?.id` (primitivo), no del objeto --
  //    ya no se recrea/refetch solo porque project-context refrescó la
  //    lista en segundo plano con el mismo proyecto.
  // 2. Aun si algo más dispara un refetch, cada sección con su propio
  //    "dirty" (setlist/timing/tickets/contactos/costos/detalles) protege
  //    sus propios campos vía `dirtyRef` -- un refresh de fondo nunca pisa
  //    una sección que la persona está editando y no ha guardado todavía.
  // OJO: cada `save()` de las secciones tiene que bajar su bandera (estado
  // Y ref) apenas guarda, ANTES de llamar a load() -- si no, el refetch se
  // salta esa sección para siempre (ver el comentario en save() de costos).
  const dirtyRef = useRef<DirtyFlags>({
    setlist: false,
    timing: false,
    tickets: false,
    contacts: false,
    costs: false,
    details: false,
  });

  // Las secciones necesitan recargar el evento después de guardar, pero
  // `load` se define más abajo (depende de sus `hydrate`). `reload` es
  // estable y siempre llama a la versión vigente de `load`.
  const loadRef = useRef<() => void>(() => {});
  const reload = useCallback(() => loadRef.current(), []);

  const eventApiUrl = `/api/eventos/${id}${activeProject ? `?projectId=${activeProject.id}` : ""}`;
  const setlist = useSetlistSection({ id, dirtyRef, reload });
  const timing = useTimingSection({ id, dirtyRef, reload });
  const contacts = useContactsSection({ id, dirtyRef, reload });
  const details = useDetailsSection({ eventApiUrl, dirtyRef });
  const tickets = useTicketsSection({ id, eventApiUrl, ticketSalesUrl: details.ticketSalesUrl, dirtyRef, reload });
  const costs = useCostsSection({ id, eventApiUrl, dirtyRef, reload });
  const costClosing = useCostClosing({ id, event, costsDirty: costs.dirty, reload });
  const costSubmissions = useCostSubmissions({ id, reload });

  const costSheetClosed = Boolean(event?.costSheetClosedAt);
  // "artist" ve la Planilla completa (necesita revisarla para poder
  // firmar el cierre) pero no puede tocar nada -- ver src/lib/project-roles.ts.
  const canEditCosts = event?.canEditCosts !== false;

  useUnsavedChangesWarning(
    setlist.dirty || contacts.dirty || timing.dirty || tickets.dirty || costs.dirty || details.dirty,
    "Tienes cambios sin guardar en este evento (setlist, contactos, timing, entradas, costos o detalles). Si sales ahora, se pierden."
  );

  useEffect(() => {
    dirtyRef.current = {
      setlist: setlist.dirty,
      timing: timing.dirty,
      tickets: tickets.dirty,
      contacts: contacts.dirty,
      costs: costs.dirty,
      details: details.dirty,
    };
  }, [setlist.dirty, timing.dirty, tickets.dirty, contacts.dirty, costs.dirty, details.dirty]);

  const activeProjectId = activeProject?.id ?? null;
  // Ref (no state) para saber si ya hubo una carga exitosa -- se necesita
  // fuera de un closure obsoleto: `load` solo se recrea cuando cambia
  // `id`/`activeProjectId`, así que leer `event` directamente adentro
  // quedaría pegado al valor de cuando se creó el callback (null la
  // primera vez, para siempre).
  const hasLoadedRef = useRef(false);

  // Se carga siempre, no solo con la caja cerrada: elegir quiénes tienen
  // que firmar (migración 101) se puede hacer antes de cerrar, y de hecho
  // es lo natural -- se deja listo y después se cierra.
  const loadSignatures = useCallback(() => {
    fetch(`/api/eventos/${id}/signatures`)
      .then((r) => (r.ok ? r.json() : null))
      .then((sig: SignatureData | null) => setSignatureData(sig))
      .catch(() => setSignatureData(null));
  }, [id]);

  const hydrateSetlist = setlist.hydrate;
  const hydrateTiming = timing.hydrate;
  const hydrateTickets = tickets.hydrate;
  const hydrateContacts = contacts.hydrate;
  const hydrateCosts = costs.hydrate;
  const hydrateDetails = details.hydrate;

  const load = useCallback(() => {
    // Solo se muestra el skeleton de carga en la carga inicial -- un
    // refetch de fondo con el evento ya en pantalla no debe hacer
    // desaparecer el formulario que la persona está mirando/editando.
    if (!hasLoadedRef.current) setLoading(true);
    setLoadError(null);
    // Se informa qué proyecto está activo en el selector -- la API rechaza
    // el evento si pertenece a otro proyecto (aislamiento entre proyectos,
    // ver /api/eventos/[id]/route.ts). "Todos los proyectos" (activeProject
    // null) no manda el parámetro, sin restricción -- ese modo es solo
    // para admins.
    const url = activeProjectId ? `/api/eventos/${id}?projectId=${activeProjectId}` : `/api/eventos/${id}`;
    fetch(url)
      .then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.json().catch(() => ({}));
        setLoadError({
          message: body.error || "No se pudo cargar el evento",
          wrongProject: Boolean(body.wrongProject),
        });
        return null;
      })
      .then((data: EventDetail | null) => {
        if (!data) {
          // Bug real encontrado el 27 ago 2026: si ya había un evento
          // cargado en pantalla (ej. se cambió el selector de proyecto
          // estando en esta misma página) y el refetch es rechazado por el
          // aislamiento entre proyectos (wrongProject), este `return`
          // temprano dejaba el evento VIEJO renderizado -- el backend
          // bloqueaba bien, pero la UI seguía mostrando datos de un
          // proyecto ajeno como si nada. Limpiar el estado para que se
          // vea el mensaje "cambia el selector" en vez del evento stale.
          setEvent(null);
          return;
        }
        hasLoadedRef.current = true;
        setEvent(data);

        // Cada sección solo se pisa con lo que vino del servidor si NO
        // tiene cambios sin guardar (cada `hydrate` revisa su bandera en
        // `dirtyRef`) -- protege contra cualquier refetch de fondo (cambio
        // de pestaña, refresh de sesión, etc.) que llegue mientras la
        // persona sigue editando esa sección puntual.
        hydrateSetlist(data);
        hydrateTiming(data);
        hydrateTickets(data);
        hydrateContacts(data);
        hydrateCosts(data);
        hydrateDetails(data);

        loadSignatures();
      })
      .catch(() => setEvent(null))
      .finally(() => setLoading(false));
  }, [id, activeProjectId, loadSignatures, hydrateSetlist, hydrateTiming, hydrateTickets, hydrateContacts, hydrateCosts, hydrateDetails]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const loadCostSubmissions = costSubmissions.loadSubmissions;
  useEffect(() => {
    // Mismo patrón que antes del refactor: la carga inicial dispara
    // setLoading/setLoadError desde `load`. La regla no lo marcaba antes solo
    // porque el compilador de React no alcanzaba a analizar el componente
    // gigante; cambiarlo alteraría el ciclo de carga.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    loadCostSubmissions();
  }, [load, loadCostSubmissions]);

  // Si el evento pertenece a otro proyecto (aislamiento entre proyectos --
  // más común de lo que parece: cambiar el selector estando parado en la
  // página de un evento de OTRO proyecto), no tiene sentido dejar a la
  // persona mirando un mensaje de error -- se la manda directo al listado
  // de Eventos del proyecto que sí tiene activo.
  useEffect(() => {
    if (loadError?.wrongProject) {
      router.replace("/eventos");
    }
  }, [loadError, router]);

  function printSection(section: PrintSection) {
    document.body.setAttribute("data-print-section", section);

    // El navegador usa document.title como nombre por defecto al Guardar
    // como PDF -- para Costos (la hoja de cierre) se pone YYMMDD - Cierre
    // [evento] para que quede prolijo y ordenado por fecha al guardarlo.
    // Se restaura el titulo real de la pagina despues de imprimir.
    const originalTitle = document.title;
    if (section === "costs" && event) {
      try {
        const datePrefix = format(new Date(`${event.date}T00:00:00`), "yyMMdd");
        document.title = `${datePrefix} - Cierre ${event.name}`;
      } catch {
        // Si la fecha viene rara, mejor no tocar el titulo que romper el print.
      }
    }

    window.print();
    document.title = originalTitle;
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 bg-muted rounded animate-pulse" />
        <div className="h-32 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="text-center py-16 space-y-1.5">
        <p className="text-muted-foreground">
          {loadError?.wrongProject
            ? "Este evento pertenece a otro proyecto -- cambia el selector arriba para verlo."
            : loadError?.message || "Evento no encontrado."}
        </p>
        <Link href="/eventos" className="text-sm text-primary hover:underline">Volver a Eventos</Link>
      </div>
    );
  }

  const utilidadCents = (event.fee ?? 0) + (event.ticketIncome ?? 0) - (event.expenses ?? 0);
  const currentEvent = event;
  const eventProject = projects.find((p) => p.id === event.projectId);

  async function fetchResponsableSuggestions(query: string) {
    if (!currentEvent.projectId) return [];
    const res = await fetch(`/api/contacts?projectId=${currentEvent.projectId}&search=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data: Array<{ id: string; name: string }> = await res.json();
    return data.map((c) => ({ label: c.name, value: c.id }));
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          [data-section] { display: none !important; }
          [data-section="header"], [data-section="footer"] { display: none !important; }
          body[data-print-section="todo"] [data-section] { display: block !important; }
          body[data-print-section="todo"] [data-section="header"],
          body[data-print-section="todo"] [data-section="footer"] { display: flex !important; }
          body[data-print-section="costs"] [data-section="header"],
          body[data-print-section="costs"] [data-section="footer"] { display: flex !important; }
          body[data-print-section="costs"] [data-section="summary"],
          body[data-print-section="costs"] [data-section="costs"] { display: block !important; }
          body[data-print-section="timing"] [data-section="header"],
          body[data-print-section="timing"] [data-section="footer"] { display: flex !important; }
          body[data-print-section="timing"] [data-section="timing"] { display: block !important; }
          body[data-print-section="setlist"] [data-section="header"],
          body[data-print-section="setlist"] [data-section="footer"] { display: flex !important; }
          body[data-print-section="setlist"] [data-section="setlist"] { display: block !important; }
          body[data-print-section="contacts"] [data-section="header"],
          body[data-print-section="contacts"] [data-section="footer"] { display: flex !important; }
          body[data-print-section="contacts"] [data-section="contacts"] { display: block !important; }
          /* El reset generico de arriba (a block) rompe el grid de 4
             columnas del resumen financiero -- se lo restaura a proposito
             en los 2 modos donde aparece (todo/costs). Tiene que calzar
             la MISMA especificidad que las reglas de arriba (body[data-
             print-section="x"] [data-section]) para ganarles -- un
             selector [data-section="summary"] suelto pierde contra esas
             aunque venga despues en el archivo, porque en CSS ante un
             empate de !important manda la especificidad, no el orden. */
          body[data-print-section="todo"] [data-section="summary"],
          body[data-print-section="costs"] [data-section="summary"] {
            display: grid !important;
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 0.4rem !important;
          }
        }
      `}</style>

      <EventDetailHeader id={id} event={event} onEdit={() => setEditOpen(true)} printSection={printSection} />

      {/* Encabezado compartido por todas las impresiones -- logo/avatar del
          proyecto (o el que sincroniza Instagram si no hay uno subido a mano),
          nombre del proyecto, nombre y fecha del evento. */}
      <EventPrintHeader
        projectName={event.projectName}
        projectAvatarUrl={eventProject?.avatarUrl ?? null}
        eventName={event.name}
        eventDateLabel={`${formatDate(event.date)} · ${event.venue}`}
        addressLine={formatShortAddress(event.address, event.city)}
      />

      {/* Resumen financiero -- oculto para roles restringidos (artist/staff),
          ver canViewCosts en GET /api/eventos/[id]. */}
      {event.canViewCosts !== false && <EventSummary event={event} utilidadCents={utilidadCents} />}

      <EventContactsSection state={contacts} printSection={printSection} fetchResponsableSuggestions={fetchResponsableSuggestions} />

      <EventSetlistSection state={setlist} printSection={printSection} />

      <EventTimingSection state={timing} printSection={printSection} fetchResponsableSuggestions={fetchResponsableSuggestions} />

      <EventTicketsSection
        event={event}
        state={tickets}
        ticketSalesUrl={details.ticketSalesUrl}
        setTicketSalesUrl={details.setTicketSalesUrl}
        canEditCosts={canEditCosts}
      />

      {/* Costos -- Card completa oculta para roles restringidos (artist/staff),
          ver canViewCosts en GET /api/eventos/[id]. */}
      {event.canViewCosts !== false && (
        <EventCostsSection
          id={id}
          event={event}
          costs={costs}
          closing={costClosing}
          submissions={costSubmissions}
          signatureData={signatureData}
          costSheetClosed={costSheetClosed}
          canEditCosts={canEditCosts}
          utilidadCents={utilidadCents}
          printSection={printSection}
          fetchResponsableSuggestions={fetchResponsableSuggestions}
        />
      )}

      {/* Aprobación del cierre de caja -- fuera de la Card de Costos a
          propósito: quien firma tiene que poder ver quién falta aunque su
          rol no lo deje ver los montos de la Planilla. */}
      {signatureData && (
        <ApprovalCard showId={id} data={signatureData} onReload={loadSignatures} />
      )}

      {/* Firma del cliente externo -- alguien que no tiene (ni va a tener)
          cuenta en la app: el productor que contrató el evento y que no es
          un proyecto de la cartera. Separado de la Aprobación de arriba a
          propósito: no cuenta para el "X/Y firmaron" interno. */}
      {event.canViewCosts !== false && (
        <ExternalSignersCard showId={id} costSheetClosed={costSheetClosed} />
      )}

      <EventRidersSection state={details} />

      <EventPrintFooter />

      <EventFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        defaultProjectId={event.projectId}
        editingShow={event}
        onSaved={load}
      />
    </div>
  );
}
