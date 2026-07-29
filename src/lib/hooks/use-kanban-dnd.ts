import { useCallback } from "react";
import {
  closestCorners,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
} from "@dnd-kit/core";

// ─── Motor de drag-and-drop compartido por los Kanban de Tareas y Tratos ─────
// Esta pieza es idéntica en ambos: sensores + estrategia de colisión. El resto
// de cada board (cómo se agrupan las tarjetas, qué pasa al soltar, cómo se ve
// la tarjeta) sigue siendo distinto a propósito y no vive aquí.

export function useKanbanDnd() {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // closestCorners solo (el default de dnd-kit) calcula mal cuando una
  // columna esta vacia -- sin tarjetas adentro, su "esquina de referencia"
  // queda rara y el drop termina cayendo en la columna vecina en vez de la
  // vacia. Con esto: primero se pregunta "¿el puntero esta literalmente
  // encima de algun droppable?" (pointerWithin) -- eso siempre resuelve
  // bien columnas vacias, porque el puntero SI esta fisicamente adentro de
  // su area. Solo si el puntero esta en un hueco entre columnas (nada
  // debajo) se usa closestCorners/rectIntersection como respaldo.
  const collisionDetectionStrategy: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;

    const rectCollisions = rectIntersection(args);
    if (rectCollisions.length > 0) return rectCollisions;

    return closestCorners(args);
  }, []);

  return { sensors, collisionDetectionStrategy };
}
