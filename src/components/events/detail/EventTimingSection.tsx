"use client";

import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SortableList } from "@/components/events/SortableList";
import { TypeaheadInput } from "@/components/events/TypeaheadInput";
import { Clock, Loader2, MapPin, Plus, Printer, Trash2, Upload } from "lucide-react";
import type { TimingItem } from "@/types/shows";
import { extractAddressCandidate, mapsSearchUrl } from "@/lib/address-detect";
import type { PrintSection, SuggestionFetcher } from "./types";
import type { TimingSectionState } from "./hooks/useTimingSection";

// Sección "Timing / Cronograma" (data-section="timing").
export function EventTimingSection({
  state,
  printSection,
  fetchResponsableSuggestions,
}: {
  state: TimingSectionState;
  printSection: (section: PrintSection) => void;
  fetchResponsableSuggestions: SuggestionFetcher;
}) {
  const { timing, extracting: extractingTiming } = state;
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <Card data-section="timing">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <Clock className="h-4 w-4" />
          Timing / Cronograma
        </CardTitle>
        <div className="flex items-center gap-2 no-print">
          {state.dirty && (
            <Button size="sm" className="h-7 text-xs cursor-pointer" disabled={state.saving} onClick={state.save}>
              {state.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar timing"}
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
            disabled={extractingTiming}
            onClick={() => fileInputRef.current?.click()}
          >
            {extractingTiming ? <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" /> : <Upload className="h-3.5 w-3.5 sm:mr-1" />}
            <span className="hidden sm:inline">{extractingTiming ? "Leyendo..." : "Subir archivo"}</span>
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" onClick={() => printSection("timing")} title="Imprimir">
            <Printer className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Imprimir</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Version limpia, solo para imprimir/mandar a produccion -- sin inputs editables */}
        {timing.length > 0 && (
          <table className="hidden print:table w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="text-left py-1 pr-3 font-medium">Hora</th>
                <th className="text-left py-1 pr-3 font-medium">Detalle</th>
                <th className="text-left py-1 pr-3 font-medium">Responsable</th>
                <th className="text-left py-1 font-medium">Notas</th>
              </tr>
            </thead>
            <tbody>
              {timing.map((item) => (
                <tr key={item.id} className="border-b border-slate-200">
                  <td className="py-1 pr-3 whitespace-nowrap">{item.timeLabel || "—"}</td>
                  <td className="py-1 pr-3">{item.activity}</td>
                  <td className="py-1 pr-3">{item.responsable || "—"}</td>
                  <td className="py-1">{item.notes || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="no-print space-y-3">
        {timing.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin ítems en el cronograma todavía.</p>
        ) : (
          <SortableList
            items={timing}
            onReorder={(items) => state.edit(() => items)}
            renderItem={(item) => {
              function updateTimingItem(patch: Partial<TimingItem>) {
                state.edit((prev) => prev.map((t) => (t.id === item.id ? { ...t, ...patch } : t)));
              }
              return (
                <div className="space-y-1.5 pb-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Hora (ej. 14:30 o 15:00-16:30)"
                      value={item.timeLabel ?? ""}
                      onChange={(e) => updateTimingItem({ timeLabel: e.target.value })}
                      className="h-7 text-xs w-20 sm:w-40 shrink-0"
                    />
                    <Input
                      placeholder="Detalle / actividad"
                      value={item.activity}
                      onChange={(e) => updateTimingItem({ activity: e.target.value })}
                      className="h-7 text-xs flex-1"
                    />
                    <button aria-label={item.activity ? `Eliminar actividad ${item.activity}` : "Eliminar actividad"}
                      onClick={() => state.edit((prev) => prev.filter((t) => t.id !== item.id))}
                      className="text-muted-foreground hover:text-destructive cursor-pointer p-1 shrink-0"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 pl-0.5 flex-wrap">
                    <TypeaheadInput
                      placeholder="Responsable"
                      value={item.responsable ?? ""}
                      onChange={(v) => updateTimingItem({ responsable: v, responsableContactId: null })}
                      onSelectSuggestion={(s) => updateTimingItem({ responsable: s.label, responsableContactId: s.value ?? null })}
                      fetchSuggestions={fetchResponsableSuggestions}
                      className="h-7 text-xs w-24 sm:w-48 shrink-0"
                    />
                    <Input
                      placeholder="Notas / detalles"
                      value={item.notes ?? ""}
                      onChange={(e) => updateTimingItem({ notes: e.target.value })}
                      className="h-7 text-xs flex-1"
                    />
                    {(() => {
                      // Detección liviana de dirección dentro del texto
                      // libre (ROLES.md/BITACORA.md, pedido de Francisco
                      // 27 ago 2026) -- si el texto tiene pinta de "calle
                      // + número", se muestra el pin para abrir Maps sin
                      // tener que copiar/pegar a otra pestaña.
                      const candidate = extractAddressCandidate(item.notes);
                      if (!candidate) return null;
                      return (
                        <a aria-label={`Ver "${candidate}" en Maps (se abre en una pestaña nueva)`}
                          href={mapsSearchUrl(candidate)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Ver "${candidate}" en Maps`}
                          className="text-muted-foreground hover:text-primary shrink-0 p-1"
                        >
                          <MapPin aria-hidden="true" className="h-4 w-4" />
                        </a>
                      );
                    })()}
                  </div>
                </div>
              );
            }}
          />
        )}

        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Hora"
              value={state.newTimeLabel}
              onChange={(e) => state.setNewTimeLabel(e.target.value)}
              className="h-7 text-xs w-20 sm:w-40 shrink-0"
            />
            <Input
              placeholder="Detalle / actividad"
              value={state.newActivity}
              onChange={(e) => state.setNewActivity(e.target.value)}
              className="h-7 text-xs flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <TypeaheadInput
              placeholder="Responsable"
              value={state.newResponsable}
              onChange={(v) => { state.setNewResponsable(v); state.setNewResponsableContactId(null); }}
              onSelectSuggestion={(s) => { state.setNewResponsable(s.label); state.setNewResponsableContactId(s.value ?? null); }}
              fetchSuggestions={fetchResponsableSuggestions}
              className="h-7 text-xs w-24 sm:w-48 shrink-0"
            />
            <Input
              placeholder="Notas / detalles"
              value={state.newNotes}
              onChange={(e) => state.setNewNotes(e.target.value)}
              className="h-7 text-xs flex-1"
            />
            {(() => {
              const candidate = extractAddressCandidate(state.newNotes);
              if (!candidate) return null;
              return (
                <a aria-label={`Ver "${candidate}" en Maps (se abre en una pestaña nueva)`}
                  href={mapsSearchUrl(candidate)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Ver "${candidate}" en Maps`}
                  className="text-muted-foreground hover:text-primary shrink-0 p-1"
                >
                  <MapPin aria-hidden="true" className="h-4 w-4" />
                </a>
              );
            })()}
            <Button aria-label="Agregar actividad"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 cursor-pointer"
              disabled={!state.newActivity.trim()}
              onClick={state.addItem}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>

          {state.showPaste ? (
            <div className="space-y-2 pt-1 border-t">
              <Textarea
                placeholder="Pega el cronograma acá (hora, actividad, responsable, notas)..."
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
                  disabled={extractingTiming || !state.pasteText.trim()}
                  onClick={state.handlePaste}
                >
                  {extractingTiming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Leer"}
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
        </div>
      </CardContent>
    </Card>
  );
}
