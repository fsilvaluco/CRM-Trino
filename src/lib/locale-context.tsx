"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  formatCurrencyWith,
  formatDateWith,
  formatRelativeDateWith,
  type LocaleSettings,
} from "./locale";

interface LocaleContextValue {
  settings: LocaleSettings;
  formatCurrency: (cents: number) => string;
  formatDate: (date: Date | number | null) => string;
  formatRelativeDate: (date: Date | number) => string;
  reload: () => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  settings: DEFAULT_LOCALE,
  formatCurrency: (c) => formatCurrencyWith(c, DEFAULT_LOCALE),
  formatDate: (d) => formatDateWith(d, DEFAULT_LOCALE),
  formatRelativeDate: (d) => formatRelativeDateWith(d, DEFAULT_LOCALE),
  reload: () => {},
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<LocaleSettings>(DEFAULT_LOCALE);

  const load = () => {
    fetch("/api/settings/locale")
      .then((r) => r.json())
      .then((data: LocaleSettings) => setSettings({ ...DEFAULT_LOCALE, ...data }))
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const value: LocaleContextValue = {
    settings,
    formatCurrency: (cents) => formatCurrencyWith(cents, settings),
    formatDate: (date) => formatDateWith(date, settings),
    formatRelativeDate: (date) => formatRelativeDateWith(date, settings),
    reload: load,
  };

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
