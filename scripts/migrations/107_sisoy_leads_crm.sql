-- Migracion 107: sisoy_leads_crm
-- Agrega seguimiento de leads a deals (aplica a todos los proyectos, sin romper nada existente)
-- y una vista de lectura para el resumen diario de SiSoy.

alter table public.deals
  add column if not exists lead_meta jsonb not null default '{}'::jsonb,
  add column if not exists last_contact_at timestamptz,
  add column if not exists next_step text,
  add column if not exists lost_reason text;

create index if not exists deals_project_stage_idx on public.deals (project_id, stage_id) where deleted_at is null;
create index if not exists deals_last_contact_idx on public.deals (last_contact_at) where deleted_at is null;

-- Convierte lead_meta->>'event_date' a date solo si tiene formato AAAA-MM-DD (evita que un dato malo rompa la vista)
create or replace function public.lead_event_date(meta jsonb)
returns date language sql immutable as $$
  select case when meta->>'event_date' ~ '^\d{4}-\d{2}-\d{2}$' then (meta->>'event_date')::date end
$$;

-- Vista para el resumen diario (solo SiSoy). security_invoker para respetar RLS.
create or replace view public.sisoy_deals_daily
with (security_invoker = true) as
select
  d.id,
  d.title,
  ps.name                                   as etapa,
  ps."order"                                as etapa_orden,
  c.name                                    as contacto,
  c.phone,
  c.email,
  d.source,
  d.value,
  public.lead_event_date(d.lead_meta)       as fecha_evento,
  d.lead_meta->>'venue'                     as lugar,
  d.lead_meta->>'guests'                    as invitados,
  d.lead_meta->>'comuna'                    as comuna,
  coalesce((d.lead_meta->>'promo_fundador')::boolean, true) as promo_fundador,
  round(extract(epoch from now() - d.created_at) / 3600)                              as horas_desde_creacion,
  round(extract(epoch from now() - coalesce(d.last_contact_at, d.created_at)) / 3600) as horas_sin_contacto,
  d.last_contact_at,
  d.next_step,
  d.lost_reason,
  -- eventos comprometidos (Negociacion o Ganado) esa misma semana; capacidad maxima 3
  (select count(*) from public.deals d2
     join public.pipeline_stages s2 on s2.id = d2.stage_id
    where d2.project_id = d.project_id and d2.deleted_at is null
      and (s2.is_won or s2.name ilike 'negoci%')
      and date_trunc('week', public.lead_event_date(d2.lead_meta))
        = date_trunc('week', public.lead_event_date(d.lead_meta))
  )                                         as eventos_mismo_finde,
  d.created_at
from public.deals d
join public.pipeline_stages ps on ps.id = d.stage_id
left join public.contacts c on c.id = d.contact_id
where d.project_id = '6258e9d5-a455-4d15-b331-5c09a5e85e0b'
  and d.deleted_at is null;
