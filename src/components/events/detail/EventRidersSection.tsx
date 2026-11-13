"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ExternalLink, FileText, Link as LinkIcon, Loader2 } from "lucide-react";
import type { DetailsSectionState } from "./hooks/useDetailsSection";

// Sección "Riders y link del evento" (data-section="riders").
export function EventRidersSection({ state }: { state: DetailsSectionState }) {
  const { eventLink, riderLocal, riderBanda } = state;
  return (
    <Card data-section="riders">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-1.5">
          <FileText className="h-4 w-4" />
          Riders y link del evento
        </CardTitle>
        {state.dirty && (
          <Button size="sm" className="h-7 text-xs cursor-pointer no-print" disabled={state.saving} onClick={state.save}>
            {state.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Version limpia, solo para "Imprimir todo" */}
        <div className="hidden print:block space-y-2 text-sm">
          {eventLink && <p><span className="font-medium">Link del evento:</span> {eventLink}</p>}
          {riderLocal && (
            <div>
              <p className="font-medium">Rider local (venue)</p>
              <p className="whitespace-pre-wrap text-slate-700">{riderLocal}</p>
            </div>
          )}
          {riderBanda && (
            <div>
              <p className="font-medium">Rider banda</p>
              <p className="whitespace-pre-wrap text-slate-700">{riderBanda}</p>
            </div>
          )}
          {!eventLink && !riderLocal && !riderBanda && <p className="text-slate-500">Sin riders ni link cargados.</p>}
        </div>

        <div className="no-print space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="event-link" className="text-xs flex items-center gap-1">
              <LinkIcon className="h-3.5 w-3.5" />
              Link del evento
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="event-link"
                placeholder="https://..."
                value={eventLink}
                onChange={(e) => { state.setEventLink(e.target.value); state.setDirty(true); }}
              />
              {eventLink && (
                <a aria-label="Abrir link del evento (se abre en una pestaña nueva)" href={eventLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground shrink-0">
                  <ExternalLink aria-hidden="true" className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rider-local" className="text-xs">Rider local (venue)</Label>
              <Textarea
                id="rider-local"
                rows={5}
                placeholder="Equipamiento del venue, o pega el link a un PDF/Drive..."
                value={riderLocal}
                onChange={(e) => { state.setRiderLocal(e.target.value); state.setDirty(true); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rider-banda" className="text-xs">Rider banda</Label>
              <Textarea
                id="rider-banda"
                rows={5}
                placeholder="Requerimientos técnicos de la banda, o pega el link a un PDF/Drive..."
                value={riderBanda}
                onChange={(e) => { state.setRiderBanda(e.target.value); state.setDirty(true); }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
