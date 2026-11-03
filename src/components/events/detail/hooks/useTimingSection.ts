"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { TimingItem } from "@/types/shows";
import type { DirtyRef, EventDetail } from "../types";
import { newId } from "../utils";
import { extractFromFile, extractFromText } from "./extract-from-file";

const ENDPOINT = "/api/eventos/timing-extract";

type ExtractedTimingItem = { timeLabel: string | null; activity: string; responsable: string | null; notes: string | null };

// Estado y acciones de la sección Timing / Cronograma (ver useSetlistSection
// para el porqué de que se llame desde la página).
export function useTimingSection({ id, dirtyRef, reload }: { id: string; dirtyRef: DirtyRef; reload: () => void }) {
  const [timing, setTiming] = useState<TimingItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newTimeLabel, setNewTimeLabel] = useState("");
  const [newActivity, setNewActivity] = useState("");
  const [newResponsable, setNewResponsable] = useState("");
  const [newResponsableContactId, setNewResponsableContactId] = useState<string | null>(null);
  const [newNotes, setNewNotes] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const hydrate = useCallback(
    (data: EventDetail) => {
      if (dirtyRef.current.timing) return;
      setTiming(data.timing ?? []);
      setDirty(false);
    },
    [dirtyRef]
  );

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/eventos/${id}/timing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: timing.map((t) => ({
            id: t.id.startsWith("tmp-") ? undefined : t.id,
            timeLabel: t.timeLabel,
            activity: t.activity,
            responsable: t.responsable,
            responsableContactId: t.responsableContactId,
            notes: t.notes,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Timing guardado");
      setDirty(false);
      dirtyRef.current.timing = false;
      reload();
    } catch {
      toast.error("No se pudo guardar el timing");
    } finally {
      setSaving(false);
    }
  }

  function appendItems(items: ExtractedTimingItem[]) {
    if (items.length === 0) {
      toast.info("No se encontraron filas -- revisa que se vea el cronograma completo");
      return;
    }
    setTiming((prev) => [
      ...prev,
      ...items.map((it, i) => ({
        id: `tmp-${newId()}`,
        position: prev.length + i,
        timeLabel: it.timeLabel,
        activity: it.activity || "Sin detalle",
        responsable: it.responsable,
        responsableContactId: null,
        notes: it.notes,
      })),
    ]);
    setDirty(true);
    toast.success(`${items.length} fila(s) agregadas -- revisa el orden y los datos antes de guardar`);
  }

  async function handleFile(file: File) {
    setExtracting(true);
    try {
      const data = await extractFromFile(ENDPOINT, file);
      if (data) appendItems((data.items as ExtractedTimingItem[] | undefined) ?? []);
    } catch {
      toast.error("Error al procesar el archivo");
    } finally {
      setExtracting(false);
    }
  }

  async function handlePaste() {
    if (!pasteText.trim()) return;
    setExtracting(true);
    try {
      const data = await extractFromText(ENDPOINT, pasteText);
      if (!data) return;
      appendItems((data.items as ExtractedTimingItem[] | undefined) ?? []);
      setPasteText("");
      setShowPaste(false);
    } catch {
      toast.error("Error al procesar el texto");
    } finally {
      setExtracting(false);
    }
  }

  function edit(updater: (prev: TimingItem[]) => TimingItem[]) {
    setTiming(updater);
    setDirty(true);
  }

  function addItem() {
    setTiming((prev) => [
      ...prev,
      {
        id: `tmp-${newId()}`,
        position: prev.length,
        timeLabel: newTimeLabel || null,
        activity: newActivity.trim(),
        responsable: newResponsable || null,
        responsableContactId: newResponsableContactId,
        notes: newNotes || null,
      },
    ]);
    setNewTimeLabel("");
    setNewActivity("");
    setNewResponsable("");
    setNewResponsableContactId(null);
    setNewNotes("");
    setDirty(true);
  }

  return {
    timing, dirty, saving, save, edit, addItem,
    newTimeLabel, setNewTimeLabel, newActivity, setNewActivity,
    newResponsable, setNewResponsable, newResponsableContactId, setNewResponsableContactId,
    newNotes, setNewNotes,
    extracting, handleFile, handlePaste,
    showPaste, setShowPaste, pasteText, setPasteText,
    hydrate,
  };
}

export type TimingSectionState = ReturnType<typeof useTimingSection>;
