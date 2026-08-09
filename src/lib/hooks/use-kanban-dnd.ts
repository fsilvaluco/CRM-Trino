import { useCallback } from "react";
import {
  closestCorners,
  pointerWithin,
  rectIntersection,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
} from "@dnd-kit/core";

// ─── Motor de drag-and-drop compartido por los Kanban de Tareas y Tratos ─────
// Esta pieza es idéntica en ambos: sensores + estrategia de colisión. El resto
// de cada board (cómo se agrupan las tarjetas, qué pasa al soltar, cómo se ve
// la tarjeta) sigue siendo distinto a propósito y no vive aquí.
//
// Importante: dnd-kit indica explícitamente en su documentación que NO hay
// que combinar PointerSensor con MouseSensor/TouchSensor -- Pointer ya cubre
// mouse y touch a la vez, y mezclarlo con TouchSensor generaba conflictos
// (el intento anterior de arreglar el scroll táctil con esa combinación no
// funcionó). Por eso el mouse va por MouseSensor, no PointerSensor.
// El otro cambio real está en las tarjetas (TaskKanbanBoard/DealCard): ahora
// el arrastre se agarra desde un handle chico dedicado, no desde toda la
// tarjeta -- así el resto de la tarjeta queda 100% libre para hacer scroll
// nativo, sin ninguna ambigüedad de por medio (recomendación oficial de
// dnd-kit para listas/tableros con scroll).
export function useKanbanDnd() {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
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
