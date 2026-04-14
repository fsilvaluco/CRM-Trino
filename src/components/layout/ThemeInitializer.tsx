"use client";

import { useEffect } from "react";

const PREFS_KEY = "user-prefs";

export function applyTheme(theme: "light" | "dark" | "auto") {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    // auto: follow system preference
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  }
}

function getStoredTheme(): "light" | "dark" | "auto" | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.theme) return parsed.theme as "light" | "dark" | "auto";
    }
  } catch {
    // ignore
  }
  return null;
}

export function ThemeInitializer() {
  useEffect(() => {
    // 1. Apply user preference from localStorage immediately (no flicker)
    const storedTheme = getStoredTheme();
    if (storedTheme) {
      applyTheme(storedTheme);
    }

    // 2. Listen for theme changes from other tabs or from PreferencesSheet
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== PREFS_KEY) return;
      try {
        const parsed = e.newValue ? JSON.parse(e.newValue) : null;
        if (parsed?.theme) applyTheme(parsed.theme as "light" | "dark" | "auto");
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", handleStorage);

    // 3. Listen for system preference changes when theme is "auto"
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = () => {
      if (getStoredTheme() === "auto" || getStoredTheme() === null) {
        applyTheme("auto");
      }
    };
    mq.addEventListener("change", handleSystemChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
      mq.removeEventListener("change", handleSystemChange);
    };
  }, []);

  return null;
}
