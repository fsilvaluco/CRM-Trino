-- ============================================================
-- Migration 084: Matriz de permisos por persona x módulo
-- ============================================================
-- Rediseño de roles (24 ago 2026, ver ROLES.md sección 0.2): reemplaza
-- project_members.role como fuente de permisos. El rol pasa a ser solo
-- una plantilla de partida -- lo que gobierna qué puede ver/editar cada
-- persona en cada proyecto es esta tabla nueva, editable persona por
-- persona (Gestor de Integrantes).
--
-- "Gestionar equipo" es su propio interruptor, independiente de la
-- matriz de módulos (ROLES.md 0.2.1) -- vive como columna en
-- project_members, no en la matriz.
-- ============================================================

ALTER TABLE project_members
  ADD COLUMN IF NOT EXISTS puede_gestionar_equipo boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS project_member_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_member_id uuid NOT NULL REFERENCES project_members(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN ('contactos','empresas','deals','tareas','eventos','campanas','finanzas')),
  puede_ver boolean NOT NULL DEFAULT false,
  puede_editar boolean NOT NULL DEFAULT false,
  puede_eliminar boolean NOT NULL DEFAULT false,
  ve_ingresos boolean NOT NULL DEFAULT false,
  ve_costos boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_member_id, module),
  CONSTRAINT editar_requiere_ver CHECK (NOT puede_editar OR puede_ver),
  CONSTRAINT eliminar_requiere_editar CHECK (NOT puede_eliminar OR puede_editar),
  CONSTRAINT ingresos_requiere_ver CHECK (NOT ve_ingresos OR puede_ver),
  CONSTRAINT costos_requiere_ver CHECK (NOT ve_costos OR puede_ver)
);

CREATE INDEX IF NOT EXISTS idx_project_member_permissions_member
  ON project_member_permissions(project_member_id);

ALTER TABLE project_member_permissions ENABLE ROW LEVEL SECURITY;

-- Mismo patrón que project_members hoy (org_access) -- el filtrado fino
-- por matriz vive en la aplicación; alinear RLS con la matriz en sí queda
-- para la Prioridad 3 (ver ROLES.md, ítem 25).
CREATE POLICY project_member_permissions_org_access ON project_member_permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM project_members pm
      JOIN projects p ON p.id = pm.project_id
      JOIN organization_members om ON om.organization_id = p.organization_id
      WHERE pm.id = project_member_permissions.project_member_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY project_member_permissions_self_read ON project_member_permissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.id = project_member_permissions.project_member_id
        AND pm.user_id = auth.uid()
    )
  );

-- ── Backfill: seed la matriz de cada project_members existente según su
-- role actual, mapeado a las 4 plantillas de ROLES.md 0.2.3 ──

-- puede_gestionar_equipo: solo admin lo trae en true por defecto.
UPDATE project_members SET puede_gestionar_equipo = true WHERE role = 'admin';

-- admin / member: mismo perfil en todos los módulos (Finanzas se ajusta
-- aparte abajo -- es la única excepción donde member ≠ admin).
INSERT INTO project_member_permissions
  (project_member_id, module, puede_ver, puede_editar, puede_eliminar, ve_ingresos, ve_costos)
SELECT pm.id, m.module, true, true, true,
  (m.module IN ('deals', 'eventos', 'finanzas')),
  (m.module = 'eventos')
FROM project_members pm
CROSS JOIN (VALUES ('contactos'), ('empresas'), ('deals'), ('tareas'), ('eventos'), ('campanas'), ('finanzas')) AS m(module)
WHERE pm.role IN ('admin', 'member')
ON CONFLICT (project_member_id, module) DO NOTHING;

-- member: Finanzas queda ver-only (ROLES.md 0.2.5).
UPDATE project_member_permissions pmp
SET puede_editar = false, puede_eliminar = false
FROM project_members pm
WHERE pmp.project_member_id = pm.id
  AND pm.role = 'member'
  AND pmp.module = 'finanzas';

-- artist: ve todo, edita solo Tareas y Campañas; ve $ de Deals/Eventos/
-- Finanzas pero no los edita.
INSERT INTO project_member_permissions
  (project_member_id, module, puede_ver, puede_editar, puede_eliminar, ve_ingresos, ve_costos)
SELECT pm.id, m.module,
  true,
  (m.module IN ('tareas', 'campanas')),
  (m.module IN ('tareas', 'campanas')),
  (m.module IN ('deals', 'eventos', 'finanzas')),
  (m.module = 'eventos')
FROM project_members pm
CROSS JOIN (VALUES ('contactos'), ('empresas'), ('deals'), ('tareas'), ('eventos'), ('campanas'), ('finanzas')) AS m(module)
WHERE pm.role = 'artist'
ON CONFLICT (project_member_id, module) DO NOTHING;

-- staff: sin Contactos/Empresas/Deals/Finanzas; ve y edita Tareas/
-- Eventos/Campañas, nunca $.
INSERT INTO project_member_permissions
  (project_member_id, module, puede_ver, puede_editar, puede_eliminar, ve_ingresos, ve_costos)
SELECT pm.id, m.module,
  (m.module IN ('tareas', 'eventos', 'campanas')),
  (m.module IN ('tareas', 'eventos', 'campanas')),
  (m.module IN ('tareas', 'eventos', 'campanas')),
  false,
  false
FROM project_members pm
CROSS JOIN (VALUES ('contactos'), ('empresas'), ('deals'), ('tareas'), ('eventos'), ('campanas'), ('finanzas')) AS m(module)
WHERE pm.role = 'staff'
ON CONFLICT (project_member_id, module) DO NOTHING;

-- ── Finanzas: project_id deja de aceptar nulos (ROLES.md 0.2.5 / ítem 11) ──
-- No hay transacciones existentes con project_id nulo hoy (verificado
-- antes de aplicar esta migración: 0 filas en total), así que no hace
-- falta backfill.
ALTER TABLE transactions ALTER COLUMN project_id SET NOT NULL;
