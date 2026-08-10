"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { AddressAutocompleteInput, type PlaceDetails } from "@/components/venues/AddressAutocompleteInput";
import type { VenueWithDetails } from "@/types/venues";

interface SimpleOption {
  id: string;
  name: string;
}

const NONE_VALUE = "__none__";

// Tri-estado para "¿Estacionamiento?" / "¿Backline?" -- null significa "no
// se sabe" (no rellenado todavía), no "no tiene". Se guarda distinto de
// false a propósito.
type TriState = "unknown" | "yes" | "no";

function triToBool(t: TriState): boolean | null {
  if (t === "yes") return true;
  if (t === "no") return false;
  return null;
}

function boolToTri(b: boolean | null): TriState {
  if (b === true) return "yes";
  if (b === false) return "no";
  return "unknown";
}

export function VenueFormDialog({
  open,
  onClose,
  editingVenue,
  onSaved,
  initialName,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  editingVenue: VenueWithDetails | null;
  onSaved: (venue: VenueWithDetails) => void;
  /** Cuando se abre desde "+ Crear nuevo venue" con texto ya tipeado en el buscador. */
  initialName?: string;
  /** Proyecto activo -- dueño de los datos privados (capacidad, contacto, etc.) */
  projectId: string;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [comuna, setComuna] = useState("");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("");
  const [capacityStanding, setCapacityStanding] = useState("");
  const [capacitySeated, setCapacitySeated] = useState("");
  const [mood, setMood] = useState("");
  const [description, setDescription] = useState("");
  const [parking, setParking] = useState<TriState>("unknown");
  const [backline, setBackline] = useState<TriState>("unknown");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [contactId, setContactId] = useState(NONE_VALUE);
  const [companyId, setCompanyId] = useState(NONE_VALUE);
  const [contacts, setContacts] = useState<SimpleOption[]>([]);
  const [companies, setCompanies] = useState<SimpleOption[]>([]);
  const [saving, setSaving] = useState(false);

  // ¿El proyecto activo ya había usado este venue antes? (tiene
  // `details` distinto de null). Si es `false`, el bloque "privado"
  // parte en blanco aunque el venue ya exista en el catálogo -- porque
  // otro proyecto lo usó, no el nuestro.
  const alreadyUsedByProject = !!editingVenue?.details;

  useEffect(() => {
    if (!open) return;

    Promise.all([fetch("/api/contacts"), fetch("/api/companies")])
      .then(async ([contactsRes, companiesRes]) => {
        const contactsData = contactsRes.ok ? await contactsRes.json() : [];
        const companiesData = companiesRes.ok ? await companiesRes.json() : [];
        setContacts(Array.isArray(contactsData) ? contactsData.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })) : []);
        setCompanies(Array.isArray(companiesData) ? companiesData.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })) : []);
      })
      .catch(() => {
        setContacts([]);
        setCompanies([]);
      });

    if (editingVenue) {
      setName(editingVenue.name);
      setAddress(editingVenue.address);
      setLatitude(editingVenue.latitude ?? null);
      setLongitude(editingVenue.longitude ?? null);
      setComuna(editingVenue.comuna ?? "");
      setRegion(editingVenue.region ?? "");
      setCountry(editingVenue.country ?? "");
      // Los datos privados solo se precargan si YA existen para el
      // proyecto activo -- si `details` viene null (venue de catálogo
      // que otro proyecto cargó, pero el nuestro nunca usó), el bloque
      // privado parte en blanco para que lo llenemos de cero.
      const details = editingVenue.details;
      setCapacityStanding(details?.capacityStanding != null ? String(details.capacityStanding) : "");
      setCapacitySeated(details?.capacitySeated != null ? String(details.capacitySeated) : "");
      setMood(details?.mood ?? "");
      setDescription(details?.description ?? "");
      setParking(boolToTri(details?.parkingAvailable ?? null));
      setBackline(boolToTri(details?.backlineAvailable ?? null));
      setWebsite(details?.website ?? "");
      setInstagram(details?.instagram ?? "");
      setContactId(details?.contactId ?? NONE_VALUE);
      setCompanyId(details?.companyId ?? NONE_VALUE);
    } else {
      setName(initialName ?? "");
      setAddress("");
      setLatitude(null);
      setLongitude(null);
      setComuna("");
      setRegion("");
      setCountry("");
      setCapacityStanding("");
      setCapacitySeated("");
      setMood("");
      setDescription("");
      setParking("unknown");
      setBackline("unknown");
      setWebsite("");
      setInstagram("");
      setContactId(NONE_VALUE);
      setCompanyId(NONE_VALUE);
    }
  }, [open, editingVenue, initialName]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    if (!address.trim()) {
      toast.error("La dirección es requerida");
      return;
    }

    setSaving(true);
    try {
      // 1) Guardar los datos de CATÁLOGO (compartidos) -- crea o edita
      //    el venue en sí (nombre, dirección, comuna/región/país, lat/lng).
      const catalogUrl = editingVenue ? `/api/venues/${editingVenue.id}` : "/api/venues";
      const catalogMethod = editingVenue ? "PUT" : "POST";
      const catalogRes = await fetch(catalogUrl, {
        method: catalogMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim(),
          latitude,
          longitude,
          comuna: comuna || null,
          region: region || null,
          country: country || null,
        }),
      });
      if (!catalogRes.ok) {
        const data = await catalogRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al guardar el venue");
      }
      const savedVenue = await catalogRes.json();
      const venueId: string = savedVenue.id;

      // 2) Guardar los datos PRIVADOS del proyecto activo (capacidad,
      //    mood, contacto, etc.) -- upsert, sin tocar lo de otros proyectos.
      const detailsRes = await fetch(`/api/venues/${venueId}/details`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          capacityStanding: capacityStanding ? parseInt(capacityStanding, 10) : null,
          capacitySeated: capacitySeated ? parseInt(capacitySeated, 10) : null,
          mood: mood || null,
          description: description || null,
          parkingAvailable: triToBool(parking),
          backlineAvailable: triToBool(backline),
          website: website || null,
          instagram: instagram || null,
          contactId: contactId === NONE_VALUE ? null : contactId,
          companyId: companyId === NONE_VALUE ? null : companyId,
        }),
      });
      if (!detailsRes.ok) {
        const data = await detailsRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al guardar los datos del venue");
      }
      const savedDetails = await detailsRes.json();

      toast.success(editingVenue ? "Venue actualizado" : "Venue creado");
      onSaved({ ...savedVenue, details: savedDetails });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar el venue");
    } finally {
      setSaving(false);
    }
  }, [
    name, address, latitude, longitude, comuna, region, country, capacityStanding, capacitySeated,
    mood, description, parking, backline, website, instagram, contactId, companyId,
    editingVenue, projectId, onSaved, onClose,
  ]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editingVenue ? "Editar venue" : "Nuevo venue"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {editingVenue && !alreadyUsedByProject && (
            <p className="text-xs text-muted-foreground bg-muted rounded-md p-2">
              Este venue ya está cargado en el catálogo (otro proyecto lo usó antes), pero tu
              proyecto nunca lo había usado -- los datos de abajo parten en blanco, solo para ti.
            </p>
          )}

          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Datos del lugar (compartidos entre proyectos)
            </p>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="venue-name">Nombre *</Label>
                <Input id="venue-name" placeholder="Plaza Victoria" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>

              <div className="space-y-2">
                <Label htmlFor="venue-address">Dirección *</Label>
                <AddressAutocompleteInput
                  id="venue-address"
                  value={address}
                  onChange={setAddress}
                  placeholder="Av. Sta. Isabel 52, Providencia"
                  onPlaceSelected={(details: PlaceDetails) => {
                    setAddress(details.address);
                    setLatitude(details.latitude);
                    setLongitude(details.longitude);
                    if (details.comuna) setComuna(details.comuna);
                    if (details.region) setRegion(details.region);
                    if (details.country) setCountry(details.country);
                  }}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="venue-comuna" className="text-xs">Comuna</Label>
                  <Input id="venue-comuna" value={comuna} onChange={(e) => setComuna(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="venue-region" className="text-xs">Región</Label>
                  <Input id="venue-region" value={region} onChange={(e) => setRegion(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="venue-country" className="text-xs">País</Label>
                  <Input id="venue-country" placeholder="Chile" value={country} onChange={(e) => setCountry(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Datos para tu proyecto (privados)
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="venue-cap-standing" className="text-xs">Capacidad parada</Label>
                  <Input
                    id="venue-cap-standing"
                    type="number"
                    min="0"
                    placeholder="Personas"
                    value={capacityStanding}
                    onChange={(e) => setCapacityStanding(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="venue-cap-seated" className="text-xs">Capacidad sentada</Label>
                  <Input
                    id="venue-cap-seated"
                    type="number"
                    min="0"
                    placeholder="Personas"
                    value={capacitySeated}
                    onChange={(e) => setCapacitySeated(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="venue-mood">Estilo / mood</Label>
                <Input
                  id="venue-mood"
                  placeholder="Pop, indie, rock, ambiente tranquilo..."
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="venue-description">Descripción</Label>
                <Textarea id="venue-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">¿Estacionamiento?</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={parking === "yes"}
                      onCheckedChange={(v) => setParking(v ? "yes" : "unknown")}
                    />
                    <span className="text-sm">Disponible</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">¿Backline?</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={backline === "yes"}
                      onCheckedChange={(v) => setBackline(v ? "yes" : "unknown")}
                    />
                    <span className="text-sm">Disponible</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="venue-website" className="text-xs">Web</Label>
                  <Input id="venue-website" placeholder="https://..." value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="venue-instagram" className="text-xs">Instagram</Label>
                  <Input id="venue-instagram" placeholder="@usuario" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Contacto</Label>
                <Select value={contactId} onValueChange={(v) => setContactId(v ?? NONE_VALUE)}>
                  <SelectTrigger className="cursor-pointer w-full">
                    <SelectValue placeholder="Sin contacto">
                      {contactId === NONE_VALUE ? "Sin contacto" : contacts.find((c) => c.id === contactId)?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Sin contacto</SelectItem>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Empresa</Label>
                <Select value={companyId} onValueChange={(v) => setCompanyId(v ?? NONE_VALUE)}>
                  <SelectTrigger className="cursor-pointer w-full">
                    <SelectValue placeholder="Sin empresa">
                      {companyId === NONE_VALUE ? "Sin empresa" : companies.find((c) => c.id === companyId)?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Sin empresa</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving} className="cursor-pointer">
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
