"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { SetlistItem } from "@/types/shows";
import type { DirtyRef, EventDetail } from "../types";
import { newId } from "../utils";
import { extractFromFile, extractFromText } from "./extract-from-file";

const ENDPOINT = "/api/eventos/setlist-extract";

// Estado y acciones de la sección Setlist. Se llama desde la página (no
// desde la sección) porque `load()` tiene que poder repoblarla con `hydrate`.
export function useSetlistSection({ id, dirtyRef, reload }: { id: string; dirtyRef: DirtyRef; reload: () => void }) {
  const [setlist, setSetlist] = useState<SetlistItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newSongTitle, setNewSongTitle] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const hydrate = useCallback(
    (data: EventDetail) => {
      if (dirtyRef.current.setlist) return;
      setSetlist(data.setlist ?? []);
      setDirty(false);
    },
    [dirtyRef]
  );

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/eventos/${id}/setlist`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: setlist.map((s) => ({ id: s.id.startsWith("tmp-") ? undefined : s.id, title: s.title, notes: s.notes })),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Setlist guardado");
      setDirty(false);
      dirtyRef.current.setlist = false;
      reload();
    } catch {
      toast.error("No se pudo guardar el setlist");
    } finally {
      setSaving(false);
    }
  }

  function appendSongs(titles: string[]) {
    if (titles.length === 0) {
      toast.info("No se encontraron canciones -- revisa que se vea la lista completa");
      return;
    }
    setSetlist((prev) => [
      ...prev,
      ...titles.map((title, i) => ({ id: `tmp-${newId()}`, position: prev.length + i, title, notes: null })),
    ]);
    setDirty(true);
    toast.success(`${titles.length} canción(es) agregadas -- revisa el orden antes de guardar`);
  }

  async function handleFile(file: File) {
    setExtracting(true);
    try {
      const data = await extractFromFile(ENDPOINT, file);
      if (data) appendSongs((data.songs as string[] | undefined) ?? []);
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
      appendSongs((data.songs as string[] | undefined) ?? []);
      setPasteText("");
      setShowPaste(false);
    } catch {
      toast.error("Error al procesar el texto");
    } finally {
      setExtracting(false);
    }
  }

  // Lista editada a mano (reordenar, editar, quitar, agregar).
  function edit(updater: (prev: SetlistItem[]) => SetlistItem[]) {
    setSetlist(updater);
    setDirty(true);
  }

  function addSong() {
    setSetlist((prev) => [...prev, { id: `tmp-${newId()}`, position: prev.length, title: newSongTitle.trim(), notes: null }]);
    setNewSongTitle("");
    setDirty(true);
  }

  return {
    setlist, dirty, saving, save, edit, addSong,
    newSongTitle, setNewSongTitle,
    extracting, handleFile, handlePaste,
    showPaste, setShowPaste, pasteText, setPasteText,
    hydrate,
  };
}

export type SetlistSectionState = ReturnType<typeof useSetlistSection>;
