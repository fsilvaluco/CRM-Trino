// Pruebas de clickableProps (activacion por teclado de elementos no nativos).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { KeyboardEvent } from "react";
import { clickableProps } from "./a11y";

/** Evento de teclado simulado: solo lo que usa clickableProps. */
function fakeKey(key: string, opts: { fromChild?: boolean } = {}) {
  const self = {};
  let prevented = false;
  const event = {
    key,
    currentTarget: self,
    target: opts.fromChild ? {} : self,
    preventDefault() {
      prevented = true;
    },
  };
  return {
    event: event as unknown as KeyboardEvent<HTMLElement>,
    wasPrevented: () => prevented,
  };
}

function counter() {
  let n = 0;
  return { fn: () => void n++, count: () => n };
}

test("clickableProps: por defecto role=button y tabIndex=0", () => {
  const p = clickableProps(() => {});
  assert.equal(p.role, "button");
  assert.equal(p.tabIndex, 0);
  assert.equal(p["aria-label"], undefined);
});

test("clickableProps: respeta role y label personalizados", () => {
  const p = clickableProps(() => {}, { role: "link", label: "Abrir evento" });
  assert.equal(p.role, "link");
  assert.equal(p["aria-label"], "Abrir evento");
});

test("clickableProps: onClick es la misma funcion de activacion", () => {
  const c = counter();
  const p = clickableProps(c.fn);
  assert.equal(p.onClick, c.fn);
});

test("clickableProps: Enter activa y evita el comportamiento por defecto", () => {
  const c = counter();
  const k = fakeKey("Enter");
  clickableProps(c.fn).onKeyDown(k.event);
  assert.equal(c.count(), 1);
  assert.equal(k.wasPrevented(), true);
});

test("clickableProps: Espacio activa y evita el scroll de la pagina", () => {
  const c = counter();
  const k = fakeKey(" ");
  clickableProps(c.fn).onKeyDown(k.event);
  assert.equal(c.count(), 1);
  assert.equal(k.wasPrevented(), true);
});

test("clickableProps: otras teclas no activan ni se bloquean", () => {
  const c = counter();
  const p = clickableProps(c.fn);
  for (const key of ["a", "Tab", "Escape", "ArrowDown", "Spacebar"]) {
    const k = fakeKey(key);
    p.onKeyDown(k.event);
    assert.equal(k.wasPrevented(), false, `la tecla ${key} no deberia bloquearse`);
  }
  assert.equal(c.count(), 0);
});

test("clickableProps: ignora teclas que vienen de un hijo (target distinto de currentTarget)", () => {
  const c = counter();
  const p = clickableProps(c.fn);
  for (const key of ["Enter", " "]) {
    const k = fakeKey(key, { fromChild: true });
    p.onKeyDown(k.event);
    assert.equal(k.wasPrevented(), false);
  }
  assert.equal(c.count(), 0);
});
