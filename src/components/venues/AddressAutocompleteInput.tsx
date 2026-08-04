"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";

interface Suggestion {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceDetails {
  address: string;
  comuna: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
}

export function AddressAutocompleteInput({
  value,
  onChange,
  onPlaceSelected,
  placeholder,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  onPlaceSelected: (details: PlaceDetails) => void;
  placeholder?: string;
  id?: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const mapsAvailableRef = useRef(true);
  const checkedConfigRef = useRef(false);
  const sessionTokenRef = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36)
  );
  const debounceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const search = useCallback((q: string) => {
    if (!mapsAvailableRef.current) return;
    if (q.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    fetch("/api/places/autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: q, sessionToken: sessionTokenRef.current }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!checkedConfigRef.current) {
          checkedConfigRef.current = true;
          if (data.configured === false) {
            // Todavía no hay GOOGLE_MAPS_API_KEY -- se cae a texto libre en
            // silencio, sin mostrar ningún error ni dropdown vacío.
            mapsAvailableRef.current = false;
            return;
          }
        }
        setSuggestions(data.suggestions ?? []);
        setOpen((data.suggestions ?? []).length > 0);
      })
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
  }, []);

  function handleChange(v: string) {
    onChange(v);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => search(v), 300);
  }

  async function handleSelect(s: Suggestion) {
    setOpen(false);
    setSuggestions([]);
    onChange(s.text);
    setLoading(true);
    try {
      const res = await fetch("/api/places/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: s.placeId, sessionToken: sessionTokenRef.current }),
      });
      const data = await res.json();
      if (res.ok && data.configured !== false) {
        const finalAddress = data.address || s.text;
        onChange(finalAddress);
        onPlaceSelected({
          address: finalAddress,
          comuna: data.comuna ?? null,
          region: data.region ?? null,
          country: data.country ?? null,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
        });
      }
    } finally {
      setLoading(false);
      // Sesión terminada (Place Details la cierra) -- una nueva para la
      // próxima búsqueda, así Google puede facturarla como sesión aparte.
      sessionTokenRef.current =
        typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className="pr-8"
      />
      {loading && (
        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-56 overflow-y-auto">
          {suggestions.map((s) => (
            <button
              key={s.placeId}
              type="button"
              onClick={() => handleSelect(s)}
              className="w-full flex items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted cursor-pointer"
            >
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate">{s.mainText}</span>
                {s.secondaryText && (
                  <span className="block text-xs text-muted-foreground truncate">{s.secondaryText}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
