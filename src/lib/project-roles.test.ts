// Tests de la lógica pura de permisos por proyecto (matriz persona × módulo,
// ROLES.md sección 0). Runner nativo de Node via tsx:
//   npm test
//
// Cubren los helpers que usan las rutas de API para decidir 403 (ver,
// editar, eliminar) y las plantillas de partida con que se siembra la
// matriz al agregar a alguien a un proyecto.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MODULE_KEYS,
  PROJECT_ROLES,
  canViewModule,
  canEditModule,
  canDeleteModule,
  canManageTeam,
  permissionsForTemplate,
  type ModuleKey,
  type ProjectPermissions,
  type ProjectRole,
} from "./project-roles";

/** Arma un ProjectPermissions a partir de una plantilla de rol. */
function permsFor(role: ProjectRole, puedeGestionarEquipo = false): ProjectPermissions {
  return { role, puedeGestionarEquipo, modules: permissionsForTemplate(role) };
}

test("sin membresía (perm = null) no puede ver, editar ni eliminar ningún módulo", () => {
  for (const mod of MODULE_KEYS) {
    assert.equal(canViewModule(null, mod), false, `ver ${mod}`);
    assert.equal(canEditModule(null, mod), false, `editar ${mod}`);
    assert.equal(canDeleteModule(null, mod), false, `eliminar ${mod}`);
  }
  assert.equal(canManageTeam(null), false);
});

test("cada helper lee solo su bandera del módulo pedido", () => {
  const perm = permsFor("staff");
  // Matriz a mano: finanzas solo ver; contactos solo editar; deals solo eliminar.
  perm.modules.finanzas = { puedeVer: true, puedeEditar: false, puedeEliminar: false, veIngresos: false, veCostos: false };
  perm.modules.contactos = { puedeVer: false, puedeEditar: true, puedeEliminar: false, veIngresos: false, veCostos: false };
  perm.modules.deals = { puedeVer: false, puedeEditar: false, puedeEliminar: true, veIngresos: false, veCostos: false };

  assert.equal(canViewModule(perm, "finanzas"), true);
  assert.equal(canEditModule(perm, "finanzas"), false);
  assert.equal(canDeleteModule(perm, "finanzas"), false);

  assert.equal(canViewModule(perm, "contactos"), false);
  assert.equal(canEditModule(perm, "contactos"), true);
  assert.equal(canDeleteModule(perm, "contactos"), false);

  assert.equal(canViewModule(perm, "deals"), false);
  assert.equal(canEditModule(perm, "deals"), false);
  assert.equal(canDeleteModule(perm, "deals"), true);
});

test("plantilla admin: ve, edita y elimina en todos los módulos", () => {
  const perm = permsFor("admin");
  for (const mod of MODULE_KEYS) {
    assert.equal(canViewModule(perm, mod), true, `ver ${mod}`);
    assert.equal(canEditModule(perm, mod), true, `editar ${mod}`);
    assert.equal(canDeleteModule(perm, mod), true, `eliminar ${mod}`);
  }
});

test("plantilla member (Manager): en finanzas ve pero no edita ni elimina (excepción 0.2.5)", () => {
  const perm = permsFor("member");
  assert.equal(canViewModule(perm, "finanzas"), true);
  assert.equal(canEditModule(perm, "finanzas"), false);
  assert.equal(canDeleteModule(perm, "finanzas"), false);

  // En el resto de los módulos tiene acceso completo.
  const others: ModuleKey[] = MODULE_KEYS.filter((m) => m !== "finanzas");
  for (const mod of others) {
    assert.equal(canEditModule(perm, mod), true, `editar ${mod}`);
    assert.equal(canDeleteModule(perm, mod), true, `eliminar ${mod}`);
  }
});

test("plantilla artist: solo lectura salvo tareas y campañas", () => {
  const perm = permsFor("artist");
  const editables: ModuleKey[] = ["tareas", "campanas"];
  for (const mod of MODULE_KEYS) {
    assert.equal(canViewModule(perm, mod), true, `ver ${mod}`);
    const expected = editables.includes(mod);
    assert.equal(canEditModule(perm, mod), expected, `editar ${mod}`);
    assert.equal(canDeleteModule(perm, mod), expected, `eliminar ${mod}`);
  }
});

test("plantilla staff: sin acceso a contactos/empresas/deals/finanzas", () => {
  const perm = permsFor("staff");
  const sinAcceso: ModuleKey[] = ["contactos", "empresas", "deals", "finanzas"];
  for (const mod of MODULE_KEYS) {
    const expected = !sinAcceso.includes(mod);
    assert.equal(canViewModule(perm, mod), expected, `ver ${mod}`);
    assert.equal(canEditModule(perm, mod), expected, `editar ${mod}`);
    assert.equal(canDeleteModule(perm, mod), expected, `eliminar ${mod}`);
  }
});

test("ninguna plantilla permite editar o eliminar sin poder ver", () => {
  for (const role of PROJECT_ROLES) {
    const modules = permissionsForTemplate(role);
    for (const mod of MODULE_KEYS) {
      const m = modules[mod];
      if (m.puedeEditar || m.puedeEliminar) {
        assert.equal(m.puedeVer, true, `${role}/${mod}`);
      }
    }
  }
});

test("canManageTeam depende solo del interruptor, no de la plantilla", () => {
  assert.equal(canManageTeam(permsFor("admin", false)), false);
  assert.equal(canManageTeam(permsFor("staff", true)), true);
});
