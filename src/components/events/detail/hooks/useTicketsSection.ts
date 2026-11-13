"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { TicketTier } from "@/types/shows";
import { compressImage } from "@/lib/image-compress";
import { useConfirm } from "@/components/shared/ConfirmProvider";
import type { DirtyRef, EventDetail, TicketsSource } from "../types";
import { formatCents, newId, normalizeTicketsSource, TICKETS_STALE_DAYS } from "../utils";

type ExtractedTier = { label: string; unitPrice: number | null; quantitySold: number | null; capacity: number | null; statusLabel: string | null };

// Estado y acciones de la sección Venta de entradas.
export function useTicketsSection({
  id,
  eventApiUrl,
  ticketSalesUrl,
  dirtyRef,
  reload,
}: {
  id: string;
  eventApiUrl: string;
  ticketSalesUrl: string;
  dirtyRef: DirtyRef;
  reload: () => void;
}) {
  const confirm = useConfirm();
  const [ticketTiers, setTicketTiers] = useState<TicketTier[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [newTierLabel, setNewTierLabel] = useState("");
  const [newTierPrice, setNewTierPrice] = useState("");
  const [newTierQty, setNewTierQty] = useState("");
  const [newTierCapacity, setNewTierCapacity] = useState("");
  // Marca de frescura (migración 094): cuándo se actualizaron por última vez
  // los tramos y por qué vía. Sin esto la tabla se veía igual de "al día"
  // tuviera datos de hoy o de hace dos semanas.
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [source, setSource] = useState<TicketsSource>("manual");
  // Descuentos sobre la venta bruta de entradas (IVA/SCD/comisión) + % que
  // le corresponde al proyecto sobre el neto -- ver migración 083. Se
  // guardan como string en el input para permitir "" mientras se edita
  // (null = no configurado, se comporta como antes sin descuentos).
  const [ivaPct, setIvaPct] = useState<string>("");
  const [comisionPct, setComisionPct] = useState<string>("");
  const [scdPct, setScdPct] = useState<string>("");
  const [splitProjectPct, setSplitProjectPct] = useState<string>("");

  const hydrate = useCallback(
    (data: EventDetail) => {
      if (dirtyRef.current.tickets) return;
      setTicketTiers(data.ticketTiers ?? []);
      setIvaPct(data.ticketIvaPct != null ? String(data.ticketIvaPct) : "");
      setComisionPct(data.ticketComisionPct != null ? String(data.ticketComisionPct) : "");
      setScdPct(data.ticketScdPct != null ? String(data.ticketScdPct) : "");
      setSplitProjectPct(data.ticketSplitProjectPct != null ? String(data.ticketSplitProjectPct) : "");
      setUpdatedAt(data.ticketsUpdatedAt ?? null);
      setSource(normalizeTicketsSource(data.ticketsUpdatedSource));
      setDirty(false);
    },
    [dirtyRef]
  );

  // Cualquier edición a mano deja la marca como "manual": los números ya no
  // son tal cual los que leyó la IA del pantallazo.
  function edit(updater: (prev: TicketTier[]) => TicketTier[]) {
    setTicketTiers(updater);
    setSource("manual");
    setDirty(true);
  }

  function addTier() {
    edit((prev) => [
      ...prev,
      {
        id: `tmp-${newId()}`,
        position: prev.length,
        label: newTierLabel.trim(),
        unitPrice: newTierPrice ? parseInt(newTierPrice, 10) * 100 : 0,
        quantitySold: newTierQty ? parseInt(newTierQty, 10) : 0,
        capacity: newTierCapacity ? parseInt(newTierCapacity, 10) : null,
        statusLabel: null,
      },
    ]);
    setNewTierLabel("");
    setNewTierPrice("");
    setNewTierQty("");
    setNewTierCapacity("");
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/eventos/${id}/tickets`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: ticketTiers.map((t) => ({
            id: t.id.startsWith("tmp-") ? undefined : t.id,
            label: t.label,
            unitPrice: t.unitPrice,
            quantitySold: t.quantitySold,
            capacity: t.capacity,
            statusLabel: t.statusLabel,
          })),
          source,
        }),
      });
      if (!res.ok) throw new Error();
      setUpdatedAt(new Date().toISOString());
      toast.success("Entradas guardadas");
      // Mismo caso que saveCosts() -- sin esto el refetch no repuebla los
      // tramos y la sección queda marcada como sucia para siempre.
      setDirty(false);
      dirtyRef.current.tickets = false;
      reload();
    } catch {
      toast.error("No se pudieron guardar las entradas");
    } finally {
      setSaving(false);
    }
  }

  // Bruto -> se descuentan IVA/comisión/SCD -> Neto -> se reparte el % que
  // le corresponde al proyecto (el resto se lo queda el venue/productora).
  // El precio de la entrada ya incluye IVA, así que el IVA se extrae del
  // bruto (bruto - bruto/1,19), no se calcula como % encima. Comisión y SCD
  // sí son % directos del bruto. Si no hay ningún % configurado,
  // montoProyecto = bruto (mismo comportamiento de antes).
  const breakdown = useMemo(() => {
    const bruto = ticketTiers.reduce((sum, t) => sum + t.unitPrice * t.quantitySold, 0);
    const ivaPctN = parseFloat(ivaPct) || 0;
    const comisionPctN = parseFloat(comisionPct) || 0;
    const scdPctN = parseFloat(scdPct) || 0;
    const splitPct = splitProjectPct.trim() === "" ? 100 : parseFloat(splitProjectPct) || 0;
    const iva = bruto - bruto / (1 + ivaPctN / 100);
    const descuentos = Math.round(iva + bruto * ((comisionPctN + scdPctN) / 100));
    const neto = bruto - descuentos;
    const montoProyecto = Math.round(neto * (splitPct / 100));
    const hasDescuentos = ivaPctN > 0 || comisionPctN > 0 || scdPctN > 0 || splitProjectPct.trim() !== "";
    return { bruto, ivaPct: ivaPctN, comisionPct: comisionPctN, scdPct: scdPctN, splitPct, descuentos, neto, montoProyecto, hasDescuentos };
  }, [ticketTiers, ivaPct, comisionPct, scdPct, splitProjectPct]);

  // Más de una semana sin actualizar = los números ya no son confiables.
  const stale = useMemo(() => {
    if (!updatedAt) return false;
    const ms = Date.now() - new Date(updatedAt).getTime();
    return ms > TICKETS_STALE_DAYS * 24 * 60 * 60 * 1000;
  }, [updatedAt]);

  async function applyToIncome() {
    const { montoProyecto } = breakdown;
    try {
      const res = await fetch(eventApiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketIncome: montoProyecto,
          ticketIvaPct: ivaPct.trim() === "" ? null : parseFloat(ivaPct),
          ticketComisionPct: comisionPct.trim() === "" ? null : parseFloat(comisionPct),
          ticketScdPct: scdPct.trim() === "" ? null : parseFloat(scdPct),
          ticketSplitProjectPct: splitProjectPct.trim() === "" ? null : parseFloat(splitProjectPct),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Entradas del evento actualizadas a ${formatCents(montoProyecto)}`);
      reload();
    } catch {
      toast.error("No se pudo actualizar el ingreso por entradas");
    }
  }

  async function handleScreenshot(file: File) {
    setExtracting(true);
    try {
      const { base64, mediaType } = await compressImage(file);
      const res = await fetch("/api/eventos/tickets-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "No se pudo leer el pantallazo");
        return;
      }
      const tiers = Array.isArray(data.tiers) ? data.tiers : [];
      if (tiers.length === 0) {
        toast.info("No se encontraron tramos en la imagen -- revisa que se vea la tabla completa");
        return;
      }
      // Se actualiza por nombre de tramo en vez de agregar a ciegas: la
      // mayoría de las veces el pantallazo es una foto MÁS RECIENTE de la
      // misma tabla (para refrescar cantidades vendidas), no tramos nuevos
      // -- si se agregara siempre, cada re-subida duplicaba todo lo que ya
      // estaba (bug reportado: "de nuevo se duplicó").
      setTicketTiers((prev) => {
        const next = [...prev];
        let added = 0;
        for (const t of tiers as ExtractedTier[]) {
          const label = t.label || "Tramo";
          const normalized = label.trim().toLowerCase();
          const existingIndex = next.findIndex((item) => item.label.trim().toLowerCase() === normalized);
          const patch = {
            label,
            unitPrice: t.unitPrice != null ? Math.round(t.unitPrice * 100) : 0,
            quantitySold: t.quantitySold ?? 0,
            capacity: t.capacity ?? null,
            statusLabel: t.statusLabel ?? null,
          };
          if (existingIndex >= 0) {
            next[existingIndex] = { ...next[existingIndex], ...patch };
          } else {
            next.push({ id: `tmp-${newId()}`, position: next.length, ...patch });
            added += 1;
          }
        }
        toast.success(
          added === tiers.length
            ? `${tiers.length} tramo(s) leídos -- revisa los números antes de guardar`
            : `${tiers.length} tramo(s) leídos (${added} nuevo(s), el resto actualizado) -- revisa antes de guardar`
        );
        return next;
      });
      setSource("pantallazo");
      setDirty(true);
    } catch {
      toast.error("Error al procesar la imagen");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSync() {
    const trimmedUrl = ticketSalesUrl.trim();
    if (!trimmedUrl) {
      toast.error("Pega primero el link de estadísticas de la ticketera");
      return;
    }
    if (
      dirty &&
      !(await confirm({
        title: "¿Sincronizar y reemplazar los tramos?",
        description: "Tienes cambios sin guardar en los tramos. Sincronizar con la ticketera los va a reemplazar.",
        confirmLabel: "Sincronizar igual",
      }))
    ) {
      return;
    }
    setSyncing(true);
    try {
      // Guarda el link de una vez, para no tener que hacerlo aparte.
      await fetch(eventApiUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketSalesUrl: trimmedUrl }),
      });

      const res = await fetch("/api/eventos/tickets-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "url", url: trimmedUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "No se pudo sincronizar");
        return;
      }
      const tiers = Array.isArray(data.tiers) ? data.tiers : [];
      if (tiers.length === 0) {
        toast.info("No se encontraron tramos en esa página");
        return;
      }
      // A diferencia del pantallazo (que agrega), sincronizar REEMPLAZA --
      // es justamente para mantener los numeros al dia, no para acumular.
      setTicketTiers(
        tiers.map((t: ExtractedTier, i: number) => ({
          id: `tmp-${newId()}`,
          position: i,
          label: t.label || "Tramo",
          unitPrice: t.unitPrice != null ? Math.round(t.unitPrice * 100) : 0,
          quantitySold: t.quantitySold ?? 0,
          capacity: t.capacity ?? null,
          statusLabel: t.statusLabel ?? null,
        }))
      );
      setSource("link");
      setDirty(true);
      toast.success(`${tiers.length} tramo(s) sincronizados -- revisa antes de guardar`);
    } catch {
      toast.error("Error al sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  return {
    ticketTiers, dirty, saving, save, edit, addTier,
    extracting, handleScreenshot, syncing, handleSync, applyToIncome,
    newTierLabel, setNewTierLabel, newTierPrice, setNewTierPrice,
    newTierQty, setNewTierQty, newTierCapacity, setNewTierCapacity,
    updatedAt, source, stale, breakdown,
    ivaPct, setIvaPct, comisionPct, setComisionPct, scdPct, setScdPct, splitProjectPct, setSplitProjectPct,
    hydrate,
  };
}

export type TicketsSectionState = ReturnType<typeof useTicketsSection>;
