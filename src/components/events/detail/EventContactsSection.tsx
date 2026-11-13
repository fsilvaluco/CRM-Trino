"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SortableList } from "@/components/events/SortableList";
import { TypeaheadInput } from "@/components/events/TypeaheadInput";
import { Loader2, Plus, Printer, Share2, Trash2, Users } from "lucide-react";
import type { EventContact } from "@/types/shows";
import type { PrintSection, SuggestionFetcher } from "./types";
import type { ContactsSectionState } from "./hooks/useContactsSection";

// Sección "Contactos importantes" (data-section="contacts").
export function EventContactsSection({
  state,
  printSection,
  fetchResponsableSuggestions,
}: {
  state: ContactsSectionState;
  printSection: (section: PrintSection) => void;
  fetchResponsableSuggestions: SuggestionFetcher;
}) {
  const { eventContacts } = state;
  return (
    <Card data-section="contacts">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          Contactos importantes
        </CardTitle>
        <div className="flex items-center gap-2 no-print">
          {state.dirty && (
            <Button size="sm" className="h-7 text-xs cursor-pointer" disabled={state.saving} onClick={state.save}>
              {state.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar contactos"}
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" onClick={() => printSection("contacts")} title="Imprimir">
            <Printer className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">Imprimir</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Version limpia, solo para imprimir -- sin inputs editables */}
        {eventContacts.length > 0 && (
          <table className="hidden print:table w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="text-left py-1 pr-3 font-medium">Cargo</th>
                <th className="text-left py-1 pr-3 font-medium">Nombre</th>
                <th className="text-left py-1 font-medium">Teléfono</th>
              </tr>
            </thead>
            <tbody>
              {eventContacts.map((c) => (
                <tr key={c.id} className="border-b border-slate-200">
                  <td className="py-1 pr-3">{c.role || "—"}</td>
                  <td className="py-1 pr-3">{c.name}</td>
                  <td className="py-1">{c.phone || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="no-print space-y-3">
          {eventContacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin contactos agregados todavía -- ej. manager, productor, encargado técnico, tour manager.
            </p>
          ) : (
            <SortableList
              items={eventContacts}
              onReorder={(items) => state.edit(() => items)}
              renderItem={(c) => {
                function updateContact(patch: Partial<EventContact>) {
                  state.edit((prev) => prev.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));
                }
                return (
                  <div className="flex items-center gap-2 flex-wrap">
                    <TypeaheadInput
                      placeholder="Nombre"
                      value={c.name}
                      onChange={(v) => updateContact({ name: v, contactId: null })}
                      onSelectSuggestion={(s) => updateContact({ name: s.label, contactId: s.value ?? null })}
                      fetchSuggestions={fetchResponsableSuggestions}
                      className="h-7 text-xs w-full sm:flex-1 sm:w-auto sm:order-2"
                    />
                    <Input
                      placeholder="Cargo (ej. Manager)"
                      value={c.role ?? ""}
                      onChange={(e) => updateContact({ role: e.target.value })}
                      className="h-7 text-xs w-24 sm:w-40 shrink-0 sm:order-1"
                    />
                    <Input
                      placeholder="Teléfono"
                      value={c.phone ?? ""}
                      onChange={(e) => updateContact({ phone: e.target.value })}
                      className="h-7 text-xs w-24 sm:w-36 shrink-0"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 cursor-pointer" title="Aparece en el link público">
                      <Checkbox checked={c.visibleOnShare} onCheckedChange={(v) => updateContact({ visibleOnShare: Boolean(v) })} />
                      <Share2 className="h-3.5 w-3.5" />
                    </label>
                    <button aria-label={c.name ? `Eliminar contacto ${c.name}` : "Eliminar contacto"}
                      onClick={() => {
                        state.edit((prev) => prev.filter((x) => x.id !== c.id));
                      }}
                      className="text-muted-foreground hover:text-destructive cursor-pointer p-1 shrink-0"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                );
              }}
            />
          )}

          <div className="flex items-center gap-2 flex-wrap pt-1">
            <TypeaheadInput
              placeholder="Nombre"
              value={state.newName}
              onChange={(v) => { state.setNewName(v); state.setNewContactId(null); }}
              onSelectSuggestion={(s) => { state.setNewName(s.label); state.setNewContactId(s.value ?? null); }}
              fetchSuggestions={fetchResponsableSuggestions}
              className="h-7 text-xs w-full sm:flex-1 sm:w-auto sm:order-2"
            />
            <Input
              placeholder="Cargo nuevo"
              value={state.newRole}
              onChange={(e) => state.setNewRole(e.target.value)}
              className="h-7 text-xs w-24 sm:w-40 shrink-0 sm:order-1"
            />
            <Input
              placeholder="Teléfono"
              value={state.newPhone}
              onChange={(e) => state.setNewPhone(e.target.value)}
              className="h-7 text-xs w-24 sm:w-36 shrink-0"
            />
            <Button aria-label="Agregar contacto"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 cursor-pointer"
              disabled={!state.newName.trim()}
              onClick={state.addContact}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Share2 className="h-3 w-3" />
            El ícono marca si ese contacto aparece en el link público del evento (por defecto, no).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
