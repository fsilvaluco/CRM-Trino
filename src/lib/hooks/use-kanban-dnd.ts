import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import {
  closestCorners,
  pointerWithin,
  rectIntersection,
  KeyboardCode,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from "@dnd-kit/core";

export interface KanbanDndOptions {
  /** Ids de los droppables que son columnas, en orden de izquierda a derecha. */
  columnIds: string[];
  /** Nombre legible de una tarjeta (para los anuncios del lector de pantalla). */
  getItemLabel: (id: UniqueIdentifier) => string;
  /**
   * Nombre de la columna para un id de droppable. Puede recibir el id de una
   * columna o el de una tarjeta (en tableros sortable el "over" puede ser
   * otra tarjeta); debe devolver la columna que la contiene.
   */
  getColumnLabel: (overId: UniqueIdentifier) => string | null;
}

const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    "Para mover esta tarjeta presiona Espacio o Enter. Usa las flechas izquierda y derecha para elegir la columna, y Espacio o Enter para soltarla. Escape cancela.",
};

interface RectLike {
  left: number;
  top: number;
  width: number;
}

/**
 * Logica pura del coordinateGetter de teclado: devuelve el punto (dentro de la
 * columna vecina) al que debe saltar la tarjeta, o undefined si no hay salto.
 * La columna actual es la que contiene el centro X de la tarjeta; si ninguna
 * lo contiene se usa la columna sobre la que esta (`overId`).
 */
export function adjacentColumnPoint({
  direction,
  collisionRect,
  droppableRects,
  columnIds,
  overId,
}: {
  direction: 1 | -1;
  collisionRect: RectLike | null | undefined;
  droppableRects: ReadonlyMap<UniqueIdentifier, RectLike>;
  columnIds: readonly string[];
  overId?: UniqueIdentifier | null;
}): { x: number; y: number } | undefined {
  if (!collisionRect) return undefined;

  // Columna actual: la que contiene el centro de la tarjeta arrastrada.
  const centerX = collisionRect.left + collisionRect.width / 2;
  let currentIndex = columnIds.findIndex((id) => {
    const rect = droppableRects.get(id);
    return rect && centerX >= rect.left && centerX <= rect.left + rect.width;
  });
  if (currentIndex === -1 && overId != null) currentIndex = columnIds.indexOf(String(overId));
  if (currentIndex === -1) return undefined;

  const nextIndex = currentIndex + direction;
  const nextRect = columnIds[nextIndex] ? droppableRects.get(columnIds[nextIndex]) : undefined;
  if (!nextRect) return undefined;
  return { x: nextRect.left + 8, y: nextRect.top + 8 };
}

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
export function useKanbanDnd({ columnIds, getItemLabel, getColumnLabel }: KanbanDndOptions) {
  // Refs para que el coordinateGetter y los anuncios (que dnd-kit captura
  // al montar el sensor) siempre lean los datos actuales.
  const columnIdsRef = useRef(columnIds);
  const labelsRef = useRef({ getItemLabel, getColumnLabel });
  useLayoutEffect(() => {
    columnIdsRef.current = columnIds;
    labelsRef.current = { getItemLabel, getColumnLabel };
  });

  // Teclado: izquierda/derecha saltan a la columna vecina (arriba/abajo no
  // hacen nada: el orden dentro de la columna no se persiste). El
  // sortableKeyboardCoordinates de dnd-kit no sirve aca porque en el tablero
  // de tareas las tarjetas son useDraggable, no sortable.
  const keyboardCoordinates: KeyboardCoordinateGetter = useCallback(
    (event, { context: { collisionRect, droppableRects, over } }) => {
      if (event.code !== KeyboardCode.Left && event.code !== KeyboardCode.Right) {
        if (event.code === KeyboardCode.Up || event.code === KeyboardCode.Down) {
          event.preventDefault();
        }
        return undefined;
      }
      event.preventDefault();
      return adjacentColumnPoint({
        direction: event.code === KeyboardCode.Right ? 1 : -1,
        collisionRect,
        droppableRects,
        columnIds: columnIdsRef.current,
        overId: over?.id,
      });
    },
    []
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates })
  );

  const accessibility = useMemo(() => {
    const item = (id: UniqueIdentifier) => `"${labelsRef.current.getItemLabel(id)}"`;
    const column = (id: UniqueIdentifier | undefined) =>
      id === undefined ? null : labelsRef.current.getColumnLabel(id);
    const announcements: Announcements = {
      onDragStart: ({ active }) =>
        `Tomaste ${item(active.id)}. Usa las flechas izquierda y derecha para cambiar de columna.`,
      onDragOver: ({ active, over }) => {
        const col = column(over?.id);
        return col ? `${item(active.id)} está sobre la columna ${col}.` : `${item(active.id)} no está sobre ninguna columna.`;
      },
      onDragEnd: ({ active, over }) => {
        const col = column(over?.id);
        return col ? `${item(active.id)} se movió a ${col}.` : `${item(active.id)} se soltó fuera de las columnas; no se movió.`;
      },
      onDragCancel: ({ active }) => `Se canceló el movimiento de ${item(active.id)}.`,
    };
    return { announcements, screenReaderInstructions: SCREEN_READER_INSTRUCTIONS };
  }, []);

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

  return { sensors, collisionDetectionStrategy, accessibility };
}
