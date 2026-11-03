"use client";

import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SortableList } from "@/components/events/SortableList";
import { Loader2, Music4, Plus, Printer, Trash2, Upload } from "lucide-react";
import type { PrintSection } from "./types";
import type { SetlistSectionState } from "./hooks/useSetlistSection";

// Sección "Setlist" (data-section="setlist").
export function EventSetlistSection({
  state,
  printSection,
}: {
  state: SetlistSectionState;
  printSection: (section: PrintSection) => void;
}) {
  const { setlist, newSongTitle, setNewSongTitle, extracting: extractingSetlist } = state;
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <Card data-section="setlist">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <Music4 className="h-4 w-4" />
          Setlist
        </CardTitle>
        <div className="flex items-center gap-2 no-print">
          {state.dirty && (
            <Button size="sm" className="h-7 text-xs cursor-pointer" disabled={state.saving} onClick={state.save}>
              {state.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar setlist"}
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.txt,text/plain,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void state.handleFile(file);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs cursor-pointer"
            disabled={extractingSetlist}
            onClick={() => fileInputRef.current?.click()}
          >
            {extractingSetlist ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" /> : <Upload className="h-3.5 w-3.5 sm:mr-1" />}
            <span className="hidden sm:inline">{extractingSetlist ? "Leyendo..." : "Subir archivo"}</span>
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" onClick={() => printSection("setlist")} title="Imprimir">
            <Printer className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Imprimir</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Version limpia, solo para imprimir/mandar a musicos -- sin inputs editables */}
        {setlist.length > 0 && (
          <ol className="hidden print:block list-decimal pl-5 space-y-1 text-sm">
            {setlist.map((song) => <li key={song.id}>{song.title}</li>)}
          </ol>
        )}

        <div className="no-print space-y-3">
          {setlist.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin canciones agregadas todavía.</p>
          ) : (
            <SortableList
              items={setlist}
              onReorder={(items) => state.edit(() => items)}
              renderItem={(song, index) => (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 shrink-0">{index + 1}.</span>
                  <Input
                    value={song.title}
                    onChange={(e) => state.edit((prev) => prev.map((s) => (s.id === song.id ? { ...s, title: e.target.value } : s)))}
                    className="h-8 text-sm"
                  />
                  <button aria-label={song.title ? `Eliminar canción ${song.title}` : "Eliminar canción"}
                    onClick={() => state.edit((prev) => prev.filter((s) => s.id !== song.id))}
                    className="text-muted-foreground hover:text-destructive cursor-pointer p-1 shrink-0"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              )}
            />
          )}
          <div className="flex items-center gap-2 pt-1">
            <Input
              placeholder="Agregar canción..."
              value={newSongTitle}
              onChange={(e) => setNewSongTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !newSongTitle.trim()) return;
                state.addSong();
              }}
              className="h-8 text-sm"
            />
            <Button aria-label="Agregar canción"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 cursor-pointer"
              disabled={!newSongTitle.trim()}
              onClick={state.addSong}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>

          {state.showPaste ? (
            <div className="space-y-2 pt-1 border-t">
              <Textarea
                placeholder="Pega el setlist acá, una canción por línea..."
                value={state.pasteText}
                onChange={(e) => state.setPasteText(e.target.value)}
                rows={4}
                className="text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs cursor-pointer" onClick={() => state.setShowPaste(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs cursor-pointer"
                  disabled={extractingSetlist || !state.pasteText.trim()}
                  onClick={state.handlePaste}
                >
                  {extractingSetlist ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Leer"}
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => state.setShowPaste(true)}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer pt-1"
            >
              o pegar texto directamente
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
