import { useCallback } from "react";
import {
  closestCorners,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  TouchSensor,
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
    // Mouse/trackpad: alcanza con distancia -- no hay gesto de scroll
    // nativo compitiendo por el mismo movimiento.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // Tactil: con distancia sola, el navegador nunca llega a decidir si es
    // scroll o drag -- dnd-kit ya capturo el gesto desde el primer toque.
    // Con delay, el toque puede moverse libre (para hacer scroll horizontal
    // del tablero) durante los primeros 200ms; solo si el dedo se queda
    // quieto ese rato sin moverse mas de "tolerance" px, ahi si se activa
    // el drag. Es el patron recomendado por dnd-kit para tableros con
    // scroll horizontal en touch.
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
