-- ============================================================
-- Migration 045: Entity Views - "punto rojo" de actividad no vista
-- Target: Supabase (Postgres).
-- ============================================================
-- Guarda, por usuario y por item (tarea o deal), la ultima vez que ese
-- usuario vio el detalle. Un item se marca con el punto rojo cuando su
-- updated_at (cambio de campo/estado) o su comentario mas reciente es
-- posterior a esa fecha -- sin importar quien hizo el cambio, porque
-- abrir el detalle (o comentar/editar uno mismo) actualiza la propia
-- fila y por lo tanto apaga el punto para quien lo causo.
--
-- Es generica (entity_type) en vez de una tabla por tipo -- mismo dato,
-- misma forma, para tasks y deals, y facil de extender a otros tipos
-- despues sin otra migracion.
-- ============================================================

CREATE TABLE IF NOT EXISTS entity_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('task', 'deal')),
  entity_id UUID NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_views_user ON entity_views(user_id);
CREATE INDEX IF NOT EXISTS idx_entity_views_lookup ON entity_views(entity_type, entity_id);

ALTER TABLE entity_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY entity_views_own ON entity_views FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- BACKFILL: marcar todo lo existente como "visto ahora" para todos los
-- miembros de cada organizacion -- si no, al desplegar esto todo el
-- catalogo entero aparece con el punto rojo para todos, lo que es puro
-- ruido en vez de señal. Desde este momento, solo cambios NUEVOS
-- prenden el punto.
-- ============================================================

INSERT INTO entity_views (user_id, entity_type, entity_id, viewed_at)
SELECT om.user_id, 'task', t.id, NOW()
FROM tasks t
JOIN organization_members om ON om.organization_id = t.organization_id
WHERE t.deleted_at IS NULL
ON CONFLICT (user_id, entity_type, entity_id) DO NOTHING;

INSERT INTO entity_views (user_id, entity_type, entity_id, viewed_at)
SELECT om.user_id, 'deal', d.id, NOW()
FROM deals d
JOIN organization_members om ON om.organization_id = d.organization_id
WHERE d.deleted_at IS NULL
ON CONFLICT (user_id, entity_type, entity_id) DO NOTHING;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT * FROM pg_policies WHERE tablename = 'entity_views';
-- SELECT entity_type, count(*) FROM entity_views GROUP BY entity_type;
