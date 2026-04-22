"use client";

import { useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { applyTheme } from "./ThemeInitializer";

export type ThemePref = "light" | "dark" | "auto";
export type LangPref = "es" | "en";

const PREFS_KEY = "user-prefs";

export interface UserPrefs {
  theme: ThemePref;
  language: LangPref;
}

export function loadPrefs(): UserPrefs {
  if (typeof window === "undefined") return { theme: "auto", language: "es" };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { theme: "auto", language: "es", ...JSON.parse(raw) };
  } catch {
    // ignore malformed JSON
  }
  return { theme: "auto", language: "es" };
}

export function savePrefs(prefs: UserPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  // Dispatch so other tabs / ThemeInitializer can react
  window.dispatchEvent(new StorageEvent("storage", { key: PREFS_KEY, newValue: JSON.stringify(prefs) }));
}

interface PreferencesSheetProps {
  open: boolean;
  onClose: () => void;
}

const themeOptions: { value: ThemePref; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "auto", label: "Sistema", icon: Monitor },
];

const langOptions: { value: LangPref; label: string; flag: string }[] = [
  { value: "es", label: "Español", flag: "🇪🇸" },
  { value: "en", label: "English", flag: "🇺🇸" },
];

export function PreferencesSheet({ open, onClose }: PreferencesSheetProps) {
  const [prefs, setPrefs] = useState<UserPrefs>(() => loadPrefs());

  function handleTheme(theme: ThemePref) {
    const next = { ...prefs, theme };
    setPrefs(next);
    savePrefs(next);
    applyTheme(theme);
  }

  function handleLanguage(language: LangPref) {
    const next = { ...prefs, language };
    setPrefs(next);
    savePrefs(next);
  }

  function handleOpenChange(isOpen: boolean) {
    if (isOpen) {
      setPrefs(loadPrefs());
      return;
    }

    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-80 sm:w-96">
        <SheetHeader>
          <SheetTitle>Preferencias personales</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-8 px-1">
          {/* Theme */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Tema</Label>
            <div className="grid grid-cols-3 gap-2">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => handleTheme(value)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border px-3 py-3 text-xs font-medium transition-colors cursor-pointer",
                    prefs.theme === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Idioma</Label>
            <div className="grid grid-cols-2 gap-2">
              {langOptions.map(({ value, label, flag }) => (
                <button
                  key={value}
                  onClick={() => handleLanguage(value)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium transition-colors cursor-pointer",
                    prefs.language === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  <span>{flag}</span>
                  {label}
                </button>
              ))}
            </div>
            {prefs.language === "en" && (
              <p className="text-xs text-muted-foreground">
                English UI strings are coming soon. Your preference is saved.
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
