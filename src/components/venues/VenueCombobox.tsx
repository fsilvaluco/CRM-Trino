"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { VenueFormDialog } from "@/components/venues/VenueFormDialog";
import { ChevronsUpDown, Plus, MapPin } from "lucide-react";
import type { Venue } from "@/types/venues";

export function VenueCombobox({
  value,
  selectedVenue,
  onSelect,
}: {
  /** venue_id seleccionado, o null si no hay ninguno */
  value: string | null;
  /** El objeto completo del venue seleccionado (para mostrar nombre/dirección sin otro fetch) */
  selectedVenue: Venue | null;
  onSelect: (venue: Venue | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const search = useCallback((q: string) => {
    setLoading(true);
    const params = q ? `?search=${encodeURIComponent(q)}` : "";
    fetch(`/api/venues${params}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setResults(Array.isArray(d) ? d : []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => search(query), 200);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [open, query, search]);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal cursor-pointer"
          >
            {selectedVenue ? (
              <span className="flex items-center gap-1.5 truncate">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {selectedVenue.name}
              </span>
            ) : (
              <span className="text-muted-foreground">Buscar o crear venue...</span>
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--anchor-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Buscar venue..." value={query} onValueChange={setQuery} />
            <CommandList>
              {!loading && results.length === 0 && (
                <CommandEmpty>Sin resultados.</CommandEmpty>
              )}
              <CommandGroup>
                {results.map((venue) => (
                  <CommandItem
                    key={venue.id}
                    value={venue.id}
                    data-checked={value === venue.id}
                    onSelect={() => {
                      onSelect(venue);
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{venue.name}</span>
                      <span className="text-xs text-muted-foreground truncate">{venue.address}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem
                  value="__create_new_venue__"
                  onSelect={() => {
                    setOpen(false);
                    setFormOpen(true);
                  }}
                  className="cursor-pointer text-primary"
                >
                  <Plus className="h-4 w-4" />
                  {query.trim() ? `Crear "${query.trim()}"` : "Crear nuevo venue"}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <VenueFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editingVenue={null}
        initialName={query.trim()}
        onSaved={(venue) => {
          onSelect(venue);
          setFormOpen(false);
        }}
      />
    </>
  );
}
