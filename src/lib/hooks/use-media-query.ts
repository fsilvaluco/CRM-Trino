"use client";

import { useSyncExternalStore } from "react";

/**
 * true mientras la media query coincide. En el servidor (y en el primer
 * render del cliente) devuelve `serverDefault` para no romper la hidratacion.
 *
 *   const isMobile = useMediaQuery("(max-width: 767px)"); // bajo el breakpoint md
 */
export function useMediaQuery(query: string, serverDefault = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverDefault
  );
}
