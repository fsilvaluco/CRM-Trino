-- ============================================================
-- Migration 069: Smartlinks (pagina de release con links a cada plataforma)
-- ============================================================
-- Un smartlink es UNA pagina publica (/s/{slug}) con caratula + nombre de
-- la cancion/release + un boton por cada plataforma (Spotify, Apple Music,
-- etc.), cada uno con su propio link. A diferencia de un QR (que redirige
-- directo a UN destino), esto es una pagina de verdad con varios destinos,
-- pensada para "link en la bio".
--
-- smartlink_links: un boton por plataforma. `platform` es la clave interna
-- (define el icono/nombre que se muestra) -- 'other' usa `label` para el
-- nombre custom.
--
-- smartlink_events: 'view' (alguien abrio la pagina) o 'click' (alguien
-- tocó un boton de plataforma especifica, platform = cual). Mismo patron
-- de tracking que qr_scans, pero separado por tipo de evento y plataforma.
-- ============================================================

CREATE TABLE IF NOT EXISTS smartlinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  artist_name TEXT,
  cover_image_url TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smartlinks_project ON smartlinks(project_id);

CREATE TABLE IF NOT EXISTS smartlink_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smartlink_id UUID NOT NULL REFERENCES smartlinks(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  url TEXT NOT NULL,
  label TEXT,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_smartlink_links_smartlink ON smartlink_links(smartlink_id, position);

CREATE TABLE IF NOT EXISTS smartlink_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smartlink_id UUID NOT NULL REFERENCES smartlinks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'view' | 'click'
  platform TEXT, -- solo para 'click'
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smartlink_events_smartlink ON smartlink_events(smartlink_id, occurred_at DESC);

ALTER TABLE smartlinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE smartlink_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE smartlink_events ENABLE ROW LEVEL SECURITY;

-- Mismo patron org-wide que qr_codes/goals -- el filtrado fino por
-- PROYECTO lo hace la API route (allowedProjectIds).
CREATE POLICY smartlinks_org_access ON smartlinks FOR ALL
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY smartlink_links_org_access ON smartlink_links FOR ALL
  USING (
    smartlink_id IN (
      SELECT id FROM smartlinks WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    smartlink_id IN (
      SELECT id FROM smartlinks WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- Solo lectura para miembros de la organizacion -- los INSERT de eventos
-- (view/click) los hace la pagina publica con el service role, nunca un
-- usuario logueado desde el cliente.
CREATE POLICY smartlink_events_org_read ON smartlink_events FOR SELECT
  USING (
    smartlink_id IN (
      SELECT id FROM smartlinks WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT * FROM smartlinks ORDER BY created_at DESC LIMIT 10;
-- SELECT smartlink_id, event_type, platform, COUNT(*) FROM smartlink_events GROUP BY 1,2,3;
