-- 034_instagram_posts_and_demographics.sql
-- Posts/Reels individuales con sus metricas de Insights API (estado
-- actual, no historico dia a dia -- igual filosofia que el catalogo de Merch).
CREATE TABLE IF NOT EXISTS instagram_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  ig_media_id TEXT NOT NULL,
  media_type TEXT,
  caption TEXT,
  permalink TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  posted_at TIMESTAMPTZ,
  views INTEGER,
  reach INTEGER,
  likes INTEGER,
  comments INTEGER,
  saved INTEGER,
  shares INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, project_id, ig_media_id)
);

CREATE INDEX IF NOT EXISTS idx_instagram_posts_project ON instagram_posts(project_id, posted_at DESC);

CREATE TABLE IF NOT EXISTS instagram_demographics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  breakdown_type TEXT NOT NULL CHECK (breakdown_type IN ('gender','age','country','city')),
  breakdown_value TEXT NOT NULL,
  value INTEGER NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, project_id, breakdown_type, breakdown_value)
);

CREATE INDEX IF NOT EXISTS idx_instagram_demo_project ON instagram_demographics(project_id, breakdown_type);

ALTER TABLE instagram_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_demographics ENABLE ROW LEVEL SECURITY;

CREATE POLICY instagram_posts_staff_all ON instagram_posts FOR ALL
  USING (organization_id = get_user_org_id() AND is_org_staff())
  WITH CHECK (organization_id = get_user_org_id() AND is_org_staff());

CREATE POLICY instagram_demographics_staff_all ON instagram_demographics FOR ALL
  USING (organization_id = get_user_org_id() AND is_org_staff())
  WITH CHECK (organization_id = get_user_org_id() AND is_org_staff());
