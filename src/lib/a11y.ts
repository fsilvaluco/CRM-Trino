import type { KeyboardEvent } from "react";

/**
 * Props para que un elemento no interactivo (div, li, tr, Card) que tiene
 * onClick tambien funcione con teclado: foco con Tab y activacion con Enter
 * o Espacio. Usar solo cuando no se pueda usar un <button> o <Link> real
 * (p. ej. una fila de tabla o una tarjeta con contenido de bloque).
 *
 *   <TableRow {...clickableProps(() => router.push(url))}>
 */
export function clickableProps(
  onActivate: () => void,
  options: { role?: "button" | "link"; label?: string } = {}
) {
  return {
    role: options.role ?? "button",
    tabIndex: 0,
    "aria-label": options.label,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      // Ignora teclas que vienen de controles internos (botones, inputs).
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  } as const;
}
