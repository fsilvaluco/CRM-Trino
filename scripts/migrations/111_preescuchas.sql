-- ============================================================
-- Migration 111: Preescuchas (link privado para escuchar un lanzamiento
-- antes de que salga en plataformas)
-- ============================================================
-- Una preescucha es UNA pagina publica (/escucha/{slug}) con caratula,
-- mensaje y un reproductor con las canciones de un disco/single que aun no
-- esta publicado. Caso de uso: prensa -- se manda el link a periodistas
-- para que escuchen el material antes del lanzamiento.
--
-- Reglas del modulo:
-- - Vigencia maxima de 30 dias desde la creacion (lo garantiza el CHECK de
--   abajo, no solo la API). Al vencer, el link deja de responder de
--   inmediato y un cron diario borra los audios del bucket
--   (/api/cron/purge-preescuchas). `purged_at` marca que los archivos ya
--   no existen; la fila queda como historial con sus contadores.
-- - Los audios se guardan SIEMPRE en MP3: si alguien sube WAV, el
--   navegador lo convierte antes de subirlo (el WAV nunca llega al bucket).
-- - `allow_download`: quien crea la preescucha decide si el link ademas
--   permite descargar los archivos (para gente de confianza).
-- - Contadores internos (visitas, reproducciones, descargas): solo se ven
--   dentro de la app, nunca en la pagina publica.
-- ============================================================

CREATE TABLE IF NOT EXISTS preescuchas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  artist_name TEXT,
  message TEXT,
  cover_path TEXT,
  allow_download BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  purged_at TIMESTAMPTZ,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 1 hora de holgura por la diferencia entre el reloj de la app y NOW().
  CONSTRAINT preescuchas_max_30_dias CHECK (expires_at <= created_at + INTERVAL '30 days 1 hour')
);

CREATE INDEX IF NOT EXISTS idx_preescuchas_project ON preescuchas(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_preescuchas_pending_purge ON preescuchas(expires_at) WHERE purged_at IS NULL;

CREATE TABLE IF NOT EXISTS preescucha_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preescucha_id UUID NOT NULL REFERENCES preescuchas(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  -- Ruta dentro del bucket 'preescuchas'. NULL = el archivo ya se borro
  -- (la preescucha vencio); el titulo y los contadores quedan de historial.
  file_path TEXT,
  duration_seconds INTEGER,
  size_bytes BIGINT,
  position INTEGER NOT NULL DEFAULT 0,
  play_count INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_preescucha_tracks_preescucha ON preescucha_tracks(preescucha_id, position);

-- Detalle de cada evento con su fecha. Los contadores de arriba son el
-- resumen rapido para el listado; esta tabla queda para analisis mas fino
-- (y para los enlaces por periodista de la etapa 2).
CREATE TABLE IF NOT EXISTS preescucha_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preescucha_id UUID NOT NULL REFERENCES preescuchas(id) ON DELETE CASCADE,
  track_id UUID REFERENCES preescucha_tracks(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'play', 'download')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_preescucha_events_preescucha ON preescucha_events(preescucha_id, occurred_at DESC);

ALTER TABLE preescuchas ENABLE ROW LEVEL SECURITY;
ALTER TABLE preescucha_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE preescucha_events ENABLE ROW LEVEL SECURITY;

-- Mismo patron org-wide que smartlinks/qr_codes -- el filtrado fino por
-- PROYECTO lo hace la API route (allowedProjectIds).
CREATE POLICY preescuchas_org_access ON preescuchas FOR ALL
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY preescucha_tracks_org_access ON preescucha_tracks FOR ALL
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

-- Solo lectura para miembros de la organizacion -- los eventos los
-- registra la pagina publica con el service role.
CREATE POLICY preescucha_events_org_read ON preescucha_events FOR SELECT
  USING (
    preescucha_id IN (
      SELECT id FROM preescuchas WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- Registro atomico de un evento: inserta la fila de detalle y suma el
-- contador correspondiente. Solo la llama el servidor (service role) desde
-- las rutas publicas; nadie mas tiene EXECUTE.
-- ============================================================
CREATE OR REPLACE FUNCTION preescucha_register_event(
  p_preescucha_id UUID,
  p_track_id UUID,
  p_event_type TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO preescucha_events (preescucha_id, track_id, event_type)
  VALUES (p_preescucha_id, p_track_id, p_event_type);

  IF p_event_type = 'view' THEN
    UPDATE preescuchas SET view_count = view_count + 1 WHERE id = p_preescucha_id;
  ELSIF p_event_type = 'play' AND p_track_id IS NOT NULL THEN
    UPDATE preescucha_tracks SET play_count = play_count + 1
    WHERE id = p_track_id AND preescucha_id = p_preescucha_id;
  ELSIF p_event_type = 'download' AND p_track_id IS NOT NULL THEN
    UPDATE preescucha_tracks SET download_count = download_count + 1
    WHERE id = p_track_id AND preescucha_id = p_preescucha_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION preescucha_register_event(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION preescucha_register_event(UUID, UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION preescucha_register_event(UUID, UUID, TEXT) TO service_role;

-- ============================================================
-- Bucket PRIVADO. No lleva policies en storage.objects a proposito: todo
-- pasa por el servidor con el service role --
-- - subir: URL firmada de subida que entrega /api/preescuchas/upload-url
--   (valida sesion y proyecto antes de firmar);
-- - escuchar/descargar: URL firmada de corta duracion que entregan las
--   rutas /api/public/preescuchas/** (validan que no haya vencido).
-- 50 MB por archivo alcanza para ~20 minutos de MP3 a 320 kbps.
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'preescuchas', 'preescuchas', false, 52428800,
  ARRAY['audio/mpeg', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT id, title, expires_at, purged_at, view_count FROM preescuchas ORDER BY created_at DESC LIMIT 10;
-- SELECT preescucha_id, title, play_count, download_count, file_path IS NULL AS borrado FROM preescucha_tracks;
-- SELECT * FROM storage.buckets WHERE id = 'preescuchas';
