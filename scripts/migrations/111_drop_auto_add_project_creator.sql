-- ============================================================
-- Migration 111: borrar el trigger que agregaba al creador de un proyecto
-- como `member` sin permiso de gestion
-- ============================================================
-- Caso Invica (30 oct 2026): Francisco (owner) creo el proyecto y despues
-- no podia gestionar equipo ahi ("No gestionas equipo en este proyecto").
--
-- Causa: `trg_auto_add_project_creator` (migracion 001) inserta al creador
-- en project_members con los valores por defecto (role='member',
-- puede_gestionar_equipo=false) ANTES de que POST /api/projects intente
-- insertarlo como admin con puede_gestionar_equipo=true. Ese segundo insert
-- chocaba contra la fila del trigger, el error se registraba solo en el log
-- y nunca se sembraba la matriz de permisos: el creador quedaba sin acceso
-- a ningun modulo y el proyecto sin nadie que gestione equipo.
--
-- POST /api/projects es el unico lugar que crea proyectos y ya agrega al
-- creador (ahora con upsert), asi que el trigger sobra.
-- ============================================================

DROP TRIGGER IF EXISTS trg_auto_add_project_creator ON projects;
DROP FUNCTION IF EXISTS auto_add_project_creator();

-- Correccion de datos (ya aplicada a mano en produccion el 30 oct 2026,
-- idempotente): creadores que quedaron como member/sin gestion en proyectos
-- donde NADIE gestiona equipo -> admin con gestion y matriz de plantilla
-- admin. No toca proyectos que ya tienen otro gestor.
WITH fixed AS (
  UPDATE project_members pm
  SET role = 'admin', puede_gestionar_equipo = true
  FROM projects p
  WHERE p.id = pm.project_id
    AND pm.user_id = p.created_by
    AND pm.puede_gestionar_equipo IS NOT TRUE
    AND NOT EXISTS (
      SELECT 1 FROM project_members o
      WHERE o.project_id = p.id AND o.puede_gestionar_equipo = true
    )
  RETURNING pm.id
)
INSERT INTO project_member_permissions
  (project_member_id, module, puede_ver, puede_editar, puede_eliminar, ve_ingresos, ve_costos)
SELECT f.id, m.module, true, true, true, m.ing, m.cos
FROM fixed f
CROSS JOIN (VALUES
  ('contactos', false, false),
  ('empresas',  false, false),
  ('deals',     true,  false),
  ('tareas',    false, false),
  ('eventos',   true,  true),
  ('campanas',  false, false),
  ('finanzas',  false, false)
) AS m(module, ing, cos)
ON CONFLICT (project_member_id, module) DO NOTHING;
