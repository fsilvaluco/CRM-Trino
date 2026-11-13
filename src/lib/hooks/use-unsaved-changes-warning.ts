"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/shared/ConfirmProvider";

/**
 * Avisa antes de salir de la pagina con cambios sin guardar:
 * - Recargar / cerrar pestaña / ir a otra web: dialogo nativo del navegador
 *   (beforeunload; los navegadores no permiten personalizar ese texto).
 * - Clic en un link interno (sidebar, breadcrumbs, etc.): dialogo propio y,
 *   si el usuario acepta, navega igual.
 *
 * No cubre el boton "atras" del navegador dentro de la app (Next no expone
 * una forma estable de bloquear esa navegacion).
 */
export function useUnsavedChangesWarning(dirty: boolean, message?: string) {
  const router = useRouter();
  const confirm = useConfirm();
  const dirtyRef = useRef(dirty);

  useEffect(() => {
    dirtyRef.current = dirty;
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Requerido por algunos navegadores para mostrar el dialogo.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const onClick = async (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // nueva pestaña: no se pierde nada
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return; // beforeunload se encarga
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      e.preventDefault();
      e.stopPropagation();
      const ok = await confirm({
        title: "¿Salir sin guardar?",
        description: message ?? "Tienes cambios sin guardar en esta página. Si sales ahora, se pierden.",
        confirmLabel: "Salir sin guardar",
        cancelLabel: "Seguir editando",
      });
      if (ok) {
        dirtyRef.current = false;
        router.push(url.pathname + url.search + url.hash);
      }
    };
    // Captura: corre antes que el onClick de <Link> de Next.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [confirm, router, message]);
}
