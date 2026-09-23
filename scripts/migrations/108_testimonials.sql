-- Migracion 108: testimonials
-- Testimonios verificados para sitios publicos (primero sisoy.pro/experiencia).
-- Flujo: la persona deja su testimonio (pending_code) -> confirma su correo con
-- un codigo de 6 digitos (verified) -> un admin lo aprueba o rechaza desde el
-- correo (approved / rejected). Solo los aprobados se publican.
-- Se accede unicamente con service role desde /api/public/testimonials/*:
-- RLS habilitado y sin politicas, asi anon/authenticated no leen nada
-- (la tabla guarda correos, IP y hashes).

create table if not exists public.testimonials (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 80),
  email              text not null check (char_length(email) <= 200),
  rating             int  not null check (rating between 1 and 5),
  body               text not null check (char_length(body) <= 1500),
  relation           text check (relation is null or char_length(relation) <= 60),
  status             text not null default 'pending_code'
                       check (status in ('pending_code', 'verified', 'approved', 'rejected')),
  -- sha256(codigo || id): el codigo en claro nunca se guarda.
  code_hash          text,
  code_expires_at    timestamptz,
  code_attempts      int  not null default 0,
  -- sha256 del token de moderacion que viaja en los links del correo al admin.
  approve_token_hash text,
  ip                 text,
  user_agent         text,
  created_at         timestamptz not null default now(),
  verified_at        timestamptz,
  approved_at        timestamptz
);

-- Listado publico (aprobados por proyecto) y cola de moderacion.
create index if not exists testimonials_project_status_idx
  on public.testimonials (project_id, status, approved_at desc);

-- Limite de solicitudes por correo por hora (ver /start). El correo se guarda
-- ya normalizado en minusculas desde la API.
create index if not exists testimonials_email_created_idx
  on public.testimonials (email, created_at desc);

alter table public.testimonials enable row level security;
-- Sin politicas a proposito: solo el service role (que salta RLS) puede leer/escribir.
