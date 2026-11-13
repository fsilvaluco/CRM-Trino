// Pruebas del mapeo de filas de asignados (deal_assignees / task_assignees).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapAssigneeRows, type AssigneeRow } from "./assignee-rows";

test("mapAssigneeRows: null y undefined devuelven arreglo vacio", () => {
  assert.deepEqual(mapAssigneeRows(null), []);
  assert.deepEqual(mapAssigneeRows(undefined), []);
  assert.deepEqual(mapAssigneeRows([]), []);
});

test("mapAssigneeRows: fila con profile se pasa a camelCase", () => {
  const rows: AssigneeRow[] = [
    {
      user_id: "u1",
      assigned_at: "2026-01-02T03:04:05Z",
      profiles: { full_name: "Ana Perez", avatar_url: "https://x/a.png", email: "ana@x.cl" },
    },
  ];
  assert.deepEqual(mapAssigneeRows(rows), [
    {
      userId: "u1",
      assignedAt: "2026-01-02T03:04:05Z",
      profile: { fullName: "Ana Perez", avatarUrl: "https://x/a.png", email: "ana@x.cl" },
    },
  ]);
});

test("mapAssigneeRows: sin profiles (ausente o null) deja profile en null", () => {
  const rows: AssigneeRow[] = [
    { user_id: "u1", assigned_at: null },
    { user_id: "u2", assigned_at: "2026-01-01T00:00:00Z", profiles: null },
  ];
  assert.deepEqual(mapAssigneeRows(rows), [
    { userId: "u1", assignedAt: null, profile: null },
    { userId: "u2", assignedAt: "2026-01-01T00:00:00Z", profile: null },
  ]);
});

test("mapAssigneeRows: campos nulos del profile se conservan como null", () => {
  const [row] = mapAssigneeRows([
    { user_id: "u3", assigned_at: null, profiles: { full_name: null, avatar_url: null, email: null } },
  ]);
  assert.deepEqual(row.profile, { fullName: null, avatarUrl: null, email: null });
});

test("mapAssigneeRows: mantiene el orden de las filas", () => {
  const out = mapAssigneeRows([
    { user_id: "b", assigned_at: null },
    { user_id: "a", assigned_at: null },
    { user_id: "c", assigned_at: null },
  ]);
  assert.deepEqual(out.map((r) => r.userId), ["b", "a", "c"]);
});
