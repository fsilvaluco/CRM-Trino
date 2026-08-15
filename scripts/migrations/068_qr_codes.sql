-- ============================================================
-- Migration 068: Códigos QR con seguimiento de escaneos
-- ============================================================
-- Cada fila de qr_codes es un QR "inteligente": apunta a
-- artistpro.app/q/{slug}, que redirige al destino real (destination_url)
-- y de paso registra el escaneo en qr_scans. Varios QR pueden apuntar al
-- MISMO destino con slugs distintos -- así se puede tener "QR flyer show
-- Valparaíso" y "QR bio Instagram" ambos yendo al mismo link, pero
-- contados por separado.
-- ============================================================

CREATE TABLE IF NOT EXISTS qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qr_codes_project ON qr_codes(project_id);

CREATE TABLE IF NOT EXISTS qr_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_qr_scans_qr_id ON qr_scans(qr_id, scanned_at DESC);

ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_scans ENABLE ROW LEVEL SECURITY;

-- Mismo patron org-wide que goals/venues -- el filtrado fino por PROYECTO
-- lo hace la API route (allowedProjectIds), igual que el resto de la app.
CREATE POLICY qr_codes_org_access ON qr_codes FOR ALL
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

-- Solo lectura para miembros de la org -- el INSERT de un escaneo lo hace
-- el redirect publico (/q/[slug]) con el service role, nunca un usuario
-- logueado desde el cliente (quien escanea no tiene sesion).
CREATE POLICY qr_scans_org_read ON qr_scans FOR SELECT
  USING (
    qr_id IN (
      SELECT id FROM qr_codes WHERE organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT * FROM qr_codes ORDER BY created_at DESC LIMIT 10;
-- SELECT qr_id, COUNT(*) FROM qr_scans GROUP BY qr_id;
