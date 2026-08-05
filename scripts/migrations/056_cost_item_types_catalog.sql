-- ============================================================
-- Migration 056: Catálogo de tipos de ítem de costo + contacto responsable
-- ============================================================
-- Los items de costo (Sonidista, Monitorista, etc.) se repiten entre
-- eventos y proyectos -- catálogo compartido a nivel de organización,
-- crece solo cuando se escribe un ítem nuevo que no está en la lista.
-- El responsable, en cambio, se vincula opcionalmente a un contacto real
-- (que sí está acotado por proyecto vía /api/contacts?projectId=), para
-- que un sonidista de Trino no aparezca sugerido en un evento de Katarsis.
-- ============================================================

CREATE TABLE IF NOT EXISTS cost_item_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE INDEX IF NOT EXISTS idx_cost_item_types_org_name ON cost_item_types(organization_id, name);

ALTER TABLE cost_item_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org access cost item types" ON cost_item_types
  FOR ALL
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

ALTER TABLE event_cost_items ADD COLUMN IF NOT EXISTS responsable_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;

-- Semilla con los roles típicos que mencionó Francisco.
INSERT INTO cost_item_types (organization_id, name)
SELECT o.id, v.name
FROM organizations o
CROSS JOIN (VALUES
  ('Sonidista'), ('Monitorista'), ('Iluminador'), ('Visualista'),
  ('Músico sesionista'), ('Asist. Producción'), ('Tour Manager'),
  ('Stage Manager'), ('Catering')
) AS v(name)
ON CONFLICT (organization_id, name) DO NOTHING;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- SELECT name FROM cost_item_types ORDER BY name;
-- SELECT column_name FROM information_schema.columns WHERE table_name='event_cost_items' AND column_name='responsable_contact_id';
