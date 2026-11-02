"use client";

import { ArrowRightLeft } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface MoveTarget {
  id: string;
  label: string;
  color?: string;
}

interface MoveToMenuProps {
  /** Nombre de la tarjeta, para el aria-label del boton. */
  itemLabel: string;
  currentId: string;
  targets: MoveTarget[];
  onMove: (targetId: string) => void;
  /** Texto del encabezado del menu. Default: "Mover a". */
  heading?: string;
  className?: string;
}

/**
 * Alternativa al arrastre: menu "Mover a..." para cambiar una tarjeta de
 * columna con un clic o con el teclado (WCAG 2.5.7, movimientos de arrastre).
 */
export function MoveToMenu({
  itemLabel,
  currentId,
  targets,
  onMove,
  heading = "Mover a",
  className,
}: MoveToMenuProps) {
  const options = targets.filter((t) => t.id !== currentId);
  if (options.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Mover "${itemLabel}" a otra columna`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className={
          className ??
          "rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer focus-visible:outline-2 focus-visible:outline-ring"
        }
      >
        <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{heading}</DropdownMenuLabel>
          {options.map((t) => (
            <DropdownMenuItem key={t.id} onClick={() => onMove(t.id)}>
              {t.color && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: t.color }}
                  aria-hidden="true"
                />
              )}
              {t.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
