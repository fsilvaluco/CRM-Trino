-- Crear la tabla principal
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  entity_name text,
  project_id uuid, -- opcionalmente references public.projects(id)
  created_at timestamptz not null default now()
);

-- Índices para consultas frecuentes (filtros y orden)
create index activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index activity_logs_user_id_idx on public.activity_logs (user_id);
create index activity_logs_entity_type_idx on public.activity_logs (entity_type);
