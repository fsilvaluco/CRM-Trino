// Pruebas del salto entre columnas con teclado del Kanban (adjacentColumnPoint).
import { test } from "node:test";
import assert from "node:assert/strict";
import { adjacentColumnPoint } from "./use-kanban-dnd";

// Tres columnas de 100px de ancho separadas por 20px: [0-100] [120-220] [240-340]
const columnIds = ["a", "b", "c"];
const droppableRects = new Map([
  ["a", { left: 0, top: 50, width: 100 }],
  ["b", { left: 120, top: 50, width: 100 }],
  ["c", { left: 240, top: 50, width: 100 }],
]);
/** Tarjeta de 80px de ancho cuyo centro X queda en `centerX`. */
const card = (centerX: number) => ({ left: centerX - 40, top: 60, width: 80 });

test("adjacentColumnPoint: derecha desde la primera columna salta a la vecina", () => {
  assert.deepEqual(
    adjacentColumnPoint({ direction: 1, collisionRect: card(50), droppableRects, columnIds }),
    { x: 128, y: 58 }
  );
});

test("adjacentColumnPoint: izquierda desde la columna del medio salta a la primera", () => {
  assert.deepEqual(
    adjacentColumnPoint({ direction: -1, collisionRect: card(170), droppableRects, columnIds }),
    { x: 8, y: 58 }
  );
});

test("adjacentColumnPoint: la columna actual la decide el centro X, no el borde de la tarjeta", () => {
  // La tarjeta empieza en "a" (left 100) pero su centro (140) esta en "b".
  assert.deepEqual(
    adjacentColumnPoint({ direction: 1, collisionRect: card(140), droppableRects, columnIds }),
    { x: 248, y: 58 }
  );
});

test("adjacentColumnPoint: los bordes de la columna cuentan como dentro", () => {
  assert.deepEqual(
    adjacentColumnPoint({ direction: 1, collisionRect: card(100), droppableRects, columnIds }),
    { x: 128, y: 58 }
  );
  assert.deepEqual(
    adjacentColumnPoint({ direction: -1, collisionRect: card(120), droppableRects, columnIds }),
    { x: 8, y: 58 }
  );
});

test("adjacentColumnPoint: en el extremo izquierdo o derecho no hay salto", () => {
  assert.equal(adjacentColumnPoint({ direction: -1, collisionRect: card(50), droppableRects, columnIds }), undefined);
  assert.equal(adjacentColumnPoint({ direction: 1, collisionRect: card(290), droppableRects, columnIds }), undefined);
});

test("adjacentColumnPoint: en el hueco entre columnas usa overId como columna actual", () => {
  assert.deepEqual(
    adjacentColumnPoint({ direction: 1, collisionRect: card(110), droppableRects, columnIds, overId: "b" }),
    { x: 248, y: 58 }
  );
});

test("adjacentColumnPoint: en el hueco y sin overId de columna no hay salto", () => {
  assert.equal(adjacentColumnPoint({ direction: 1, collisionRect: card(110), droppableRects, columnIds }), undefined);
  assert.equal(
    adjacentColumnPoint({ direction: 1, collisionRect: card(110), droppableRects, columnIds, overId: "tarjeta-1" }),
    undefined
  );
});

test("adjacentColumnPoint: sin collisionRect no hay salto", () => {
  assert.equal(adjacentColumnPoint({ direction: 1, collisionRect: null, droppableRects, columnIds }), undefined);
});

test("adjacentColumnPoint: si la columna vecina no tiene rect medido no hay salto", () => {
  const sinC = new Map([...droppableRects].filter(([id]) => id !== "c"));
  assert.equal(
    adjacentColumnPoint({ direction: 1, collisionRect: card(170), droppableRects: sinC, columnIds }),
    undefined
  );
});
