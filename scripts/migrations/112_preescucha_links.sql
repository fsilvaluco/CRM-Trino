-- ============================================================
-- Migration 112: Preescuchas -- enlaces individuales por persona
-- ============================================================
-- Hasta ahora cada preescucha tenia UN enlace general. Eso no deja saber
-- quien escucho: si se le manda a 20 periodistas, el contador solo dice
-- "40 reproducciones". Con esta migracion se puede crear, ademas, un
-- enlace distinto para cada persona (/escucha/{slug propio}):
--
-- - `preescucha_links`: un enlace por destinatario, con su nombre y,
--   opcionalmente, el contacto del CRM. Se puede revocar (`revoked_at`)
--   sin afectar a los demas -- por ejemplo si ese enlace se filtro.
-- - `preescucha_events.link_id`: cada visita/reproduccion/descarga queda
--   asociada al enlace por el que entro. NULL = enlace general.
-- - El enlace general sigue existiendo y funcionando igual.
--
-- La vigencia es la de la preescucha: cuando esta vence, dejan de
-- funcionar todos sus enlaces, individuales incluidos.
-- ============================================================

CREATE TABLE IF NOT EXISTS preescucha_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preescucha_id UUID NOT NULL REFERENCES preescuchas(id) ON DELETE CASCADE,
  -- Comparte "espacio de nombres" con preescuchas.slug: ambos se abren en
  -- /escucha/{slug}. La API verifica que no se repita entre las dos tablas.
  slug TEXT NOT NULL UNIQUE,
  recipient_name TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  view_count INTEGER NOT NULL DEFAULT 0,
  play_count INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_preescucha_links_preescucha ON preescucha_links(preescucha_id, created_at);

-- Si se borra un enlace, su actividad pasada no se pierde: queda sin
-- enlace (cuenta como del enlace general).
ALTER TABLE preescucha_events
  ADD COLUMN IF NOT EXISTS link_id UUID REFERENCES preescucha_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_preescucha_events_link ON preescucha_events(link_id) WHERE link_id IS NOT NULL;

ALTER TABLE preescucha_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY preescucha_links_org_access ON preescucha_links FOR ALL
  USING (
    preescucha_id IN (
      SELECT id FROM preescuchas WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    preescucha_id IN (
      SELECT id FROM preescuchas WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- Registro de eventos: misma funcion de la migracion 111, ahora con el
-- enlace por el que entro la persona. Se reemplaza la firma de 3
-- argumentos por una de 4 con DEFAULT NULL, asi las llamadas antiguas
-- (sin p_link_id) siguen funcionando durante el despliegue.
-- ============================================================
DROP FUNCTION IF EXISTS preescucha_register_event(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION preescucha_register_event(
  p_preescucha_id UUID,
  p_track_id UUID,
  p_event_type TEXT,
  p_link_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO preescucha_events (preescucha_id, track_id, event_type, link_id)
  VALUES (p_preescucha_id, p_track_id, p_event_type, p_link_id);

  IF p_event_type = 'view' THEN
    UPDATE preescuchas SET view_count = view_count + 1 WHERE id = p_preescucha_id;
  ELSIF p_event_type = 'play' AND p_track_id IS NOT NULL THEN
    UPDATE preescucha_tracks SET play_count = play_count + 1
    WHERE id = p_track_id AND preescucha_id = p_preescucha_id;
  ELSIF p_event_type = 'download' AND p_track_id IS NOT NULL THEN
    UPDATE preescucha_tracks SET download_count = download_count + 1
    WHERE id = p_track_id AND preescucha_id = p_preescucha_id;
  END IF;

  IF p_link_id IS NOT NULL THEN
    UPDATE preescucha_links SET
      view_count = view_count + (p_event_type = 'view')::int,
      play_count = play_count + (p_event_type = 'play')::int,
      download_count = download_count + (p_event_type = 'download')::int,
      last_activity_at = NOW()
    WHERE id = p_link_id AND preescucha_id = p_preescucha_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION preescucha_register_event(UUID, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION preescucha_register_event(UUID, UUID, TEXT, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION preescucha_register_event(UUID, UUID, TEXT, UUID) TO service_role;

-- ============================================================
-- Detalle "quien escucho que": reproducciones y descargas por enlace y
-- por cancion, en una sola respuesta JSON (evita el tope de 1000 filas de
-- la API cuando hay muchos enlaces x canciones). SECURITY INVOKER: aplica
-- el RLS de preescucha_events, asi que solo ve datos de su organizacion.
-- link_id NULL = enlace general.
-- ============================================================
CREATE OR REPLACE FUNCTION preescucha_link_track_stats(p_preescucha_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
  FROM (
    SELECT link_id, track_id, event_type, COUNT(*)::int AS total
    FROM preescucha_events
    WHERE preescucha_id = p_preescucha_id
    GROUP BY link_id, track_id, event_type
  ) s;
$$;

REVOKE ALL ON FUNCTION preescucha_link_track_stats(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION preescucha_link_track_stats(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION preescucha_link_track_stats(UUID) TO authenticated, service_role;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT recipient_name, slug, revoked_at, view_count, play_count FROM preescucha_links ORDER BY created_at DESC LIMIT 20;
-- SELECT preescucha_link_track_stats('<id de una preescucha>');
