-- ============================================================
-- Migration 101: Firmantes elegidos a mano para el cierre de caja de un
-- evento
-- ============================================================
-- Hasta ahora los firmantes requeridos del cierre se calculaban 100% en
-- caliente: "todos los project_members que ven ingresos Y costos de
-- Eventos" (ver src/lib/event-signatures.ts). En proyectos con harta gente
-- eso llena la lista de personas que no tienen por que aprobar ese evento
-- puntual -- pedido de Francisco (15 sep 2026): poder marcar con un check
-- quienes SI tienen que firmar.
--
-- Mismo criterio que settlements.required_signer_ids (migracion 088):
-- lista vacia = comportamiento de siempre (firman todos los que califican),
-- asi que ningun evento existente cambia. Con la lista cargada, solo esos
-- son los requeridos.
--
-- La eleccion es siempre un SUBCONJUNTO de los que califican por permisos:
-- no se puede obligar a firmar a alguien que no puede ver los numeros que
-- estaria aprobando (ROLES.md, item 20 del rediseno de roles). Eso lo
-- valida la API, no la base.
-- ============================================================

ALTER TABLE shows ADD COLUMN IF NOT EXISTS required_signer_ids UUID[] NOT NULL DEFAULT '{}';

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT name, required_signer_ids FROM shows
--   WHERE array_length(required_signer_ids, 1) > 0;
