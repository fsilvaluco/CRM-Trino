"use client";

import { useEffect } from "react";

export function applyTheme(theme: "light" | "dark" | "auto") {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    // auto: follow system
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  }
}

export function ThemeInitializer() {
  useEffect(() => {
    fetch("/api/settings/business")
      .then((r) => r.json())
      .then((data) => {
        const theme = data?.preferences?.theme as "light" | "dark" | "auto" | undefined;
        if (theme) applyTheme(theme);
      })
      .catch(() => {});

    // Listen for system preference changes when in auto mode
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = () => {
      fetch("/api/settings/business")
        .then((r) => r.json())
        .then((data) => {
          if (data?.preferences?.theme === "auto") applyTheme("auto");
        })
        .catch(() => {});
    };
    mq.addEventListener("change", handleSystemChange);
    return () => mq.removeEventListener("change", handleSystemChange);
  }, []);

  return null;
}
