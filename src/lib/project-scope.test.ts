// Tests del alcance por proyecto. Runner nativo de Node via tsx:
//   npm test
//
// Lo que cuidan es una fuga concreta: estando en un evento de un proyecto, no
// tienen que aparecer eventos (ni montos) de los demas proyectos de la
// organizacion. El permiso no alcanza a taparlo porque un admin ve todo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { projectScopeIds, isInProjectScope } from "./project-scope";

/** Supabase de mentira: responde el .select().eq() de `projects` con los hijos
 * que se le pasen, y anota como lo llamaron. */
function fakeSupabase(children: { id: string }[]) {
  const calls: { table: string; column?: string; value?: string }[] = [];
  return {
    calls,
    from(table: string) {
      const call: { table: string; column?: string; value?: string } = { table };
      calls.push(call);
      return {
        select() {
          return {
            eq(column: string, value: string) {
              call.column = column;
              call.value = value;
              return Promise.resolve({ data: children });
            },
          };
        },
      };
    },
  };
}

test("projectScopeIds: el proyecto y sus hijos", async () => {
  const supabase = fakeSupabase([{ id: "hijo-1" }, { id: "hijo-2" }]);
  const ids = await projectScopeIds(supabase, "gamuza");

  assert.deepEqual(ids, ["gamuza", "hijo-1", "hijo-2"]);
  // Se pregunto por los hijos DE ESE proyecto, no por todos los proyectos.
  assert.deepEqual(supabase.calls, [
    { table: "projects", column: "parent_project_id", value: "gamuza" },
  ]);
});

test("projectScopeIds: sin hijos, solo el proyecto", async () => {
  assert.deepEqual(await projectScopeIds(fakeSupabase([]), "gamuza"), ["gamuza"]);
});

test("projectScopeIds: sin proyecto no consulta nada y devuelve null", async () => {
  const supabase = fakeSupabase([{ id: "hijo-1" }]);
  assert.equal(await projectScopeIds(supabase, null), null);
  assert.deepEqual(supabase.calls, []);
});

test("isInProjectScope: deja pasar el propio proyecto y sus hijos", () => {
  const scope = ["gamuza", "gamuza-hijo"];
  assert.equal(isInProjectScope(scope, "gamuza"), true);
  assert.equal(isInProjectScope(scope, "gamuza-hijo"), true);
});

test("isInProjectScope: bloquea otro proyecto -- el caso del reporte", () => {
  const scope = ["gamuza"];
  assert.equal(isInProjectScope(scope, "ennio"), false);
  assert.equal(isInProjectScope(scope, "sisoy"), false);
  // Un evento sin proyecto tampoco entra al alcance de un proyecto.
  assert.equal(isInProjectScope(scope, null), false);
});

test("isInProjectScope: sin proyecto (null) solo acepta lo que tampoco tiene", () => {
  assert.equal(isInProjectScope(null, null), true);
  assert.equal(isInProjectScope(null, "gamuza"), false);
});
