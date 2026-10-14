-- Migracion 109: spotify_geo_snapshots
-- Oyentes por pais y ciudad desde Spotify for Artists. Cada corte es una
-- ventana de 28 dias que termina en period_end. Lo carga la revision semanal
-- de los viernes (tarea programada de Claude), no la app.
-- Ya aplicada en produccion via MCP el 14-oct-2026; este archivo la documenta.

create table if not exists public.spotify_geo_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  scope text not null check (scope in ('country','city')),
  country text not null,
  city text not null default '',
  region text,
  rank integer,
  listeners integer,
  active_listeners integer,
  source text not null default 'spotify_for_artists',
  created_at timestamptz not null default now(),
  constraint spotify_geo_snapshots_uniq unique (project_id, period_end, scope, country, city)
);

comment on table public.spotify_geo_snapshots is 'Oyentes por país/ciudad desde Spotify for Artists (ventana de 28 días que termina en period_end). Cargado semanalmente.';
comment on column public.spotify_geo_snapshots.rank is 'Posición en el ranking mundial de Spotify (países o ciudades). Null si la ciudad solo aparece en la lista filtrada por país.';

create index if not exists idx_spotify_geo_project
  on public.spotify_geo_snapshots (organization_id, project_id, period_end desc, scope);

alter table public.spotify_geo_snapshots enable row level security;

drop policy if exists spotify_geo_snapshots_project_member on public.spotify_geo_snapshots;
create policy spotify_geo_snapshots_project_member on public.spotify_geo_snapshots
  for all using (is_org_admin(organization_id) or is_project_member(project_id))
  with check (is_org_admin(organization_id) or is_project_member(project_id));
