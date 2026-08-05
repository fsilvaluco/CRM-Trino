"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";

export interface TypeaheadSuggestion {
  label: string;
  value?: string;
}

export function TypeaheadInput({
  value,
  onChange,
  onSelectSuggestion,
  fetchSuggestions,
  placeholder,
  className,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelectSuggestion?: (s: TypeaheadSuggestion) => void;
  fetchSuggestions: (query: string) => Promise<TypeaheadSuggestion[]>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<TypeaheadSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChange(v: string) {
    onChange(v);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!v.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const results = await fetchSuggestions(v);
        setSuggestions(results);
        setOpen(results.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 200);
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <Input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={`w-full ${className ?? ""}`}
        disabled={disabled}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full min-w-48 rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.value ?? `${s.label}-${i}`}
              type="button"
              onClick={() => {
                onChange(s.label);
                onSelectSuggestion?.(s);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted cursor-pointer truncate"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
