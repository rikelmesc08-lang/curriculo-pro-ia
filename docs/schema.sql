-- ---------------------------------------------------------------------------
-- CurrículoPro IA — esquema do banco (Supabase / Postgres)
--
-- Rode este arquivo inteiro no editor SQL do projeto Supabase antes de apontar
-- o app para ele (DB_DRIVER=supabase).
--
-- DECISÕES QUE VALE ENTENDER ANTES DE MEXER:
--
-- 1. O corpo do currículo mora numa coluna jsonb. As seções são um documento
--    que só faz sentido inteiro, sempre lido e gravado de uma vez, e nunca
--    consultado por campo interno. Normalizar sete tabelas filhas custaria
--    sete joins por leitura sem comprar nenhuma consulta que o produto faça.
--    title, variant e template ficam fora do jsonb porque são exatamente o que
--    a listagem precisa ler sem abrir o documento.
--
-- 2. RLS está LIGADA em todas as tabelas, com política por operação. Currículo
--    carrega nome, telefone e e-mail de uma pessoa real: a barreira precisa
--    estar no banco, não só no código da aplicação.
--
-- 3. profiles é preenchida por gatilho quando um usuário se cadastra. Sem
--    isso, o app teria que criar o perfil na primeira requisição autenticada —
--    e um cadastro interrompido no meio deixaria usuário sem perfil.
-- ---------------------------------------------------------------------------


-- Perfis ---------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text not null default '',
  plan text not null default 'gratuito' check (plan in ('gratuito', 'pro')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "perfil: ler o proprio" on public.profiles;
create policy "perfil: ler o proprio" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "perfil: atualizar o proprio" on public.profiles;
create policy "perfil: atualizar o proprio" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "perfil: apagar o proprio" on public.profiles;
create policy "perfil: apagar o proprio" on public.profiles
  for delete using (auth.uid() = id);

-- O perfil nasce junto com o usuário. security definer é necessário: o gatilho
-- roda no contexto do cadastro, antes de existir sessão para a RLS avaliar.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- Currículos -----------------------------------------------------------------

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Meu currículo',
  variant text not null default 'geral',
  template text not null default 'moderno',
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A listagem sempre busca por dono e ordena por atualização. Sem este índice,
-- cada abertura do painel faz varredura sequencial na tabela inteira.
create index if not exists resumes_owner_updated_idx
  on public.resumes (owner_id, updated_at desc);

alter table public.resumes enable row level security;

drop policy if exists "curriculo: ler os proprios" on public.resumes;
create policy "curriculo: ler os proprios" on public.resumes
  for select using (auth.uid() = owner_id);

drop policy if exists "curriculo: criar para si" on public.resumes;
create policy "curriculo: criar para si" on public.resumes
  for insert with check (auth.uid() = owner_id);

drop policy if exists "curriculo: atualizar os proprios" on public.resumes;
create policy "curriculo: atualizar os proprios" on public.resumes
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "curriculo: apagar os proprios" on public.resumes;
create policy "curriculo: apagar os proprios" on public.resumes
  for delete using (auth.uid() = owner_id);


-- Candidaturas ---------------------------------------------------------------

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  company text not null,
  role text not null,
  applied_at date,
  status text not null default 'aplicado'
    check (status in ('aplicado', 'em-analise', 'entrevista', 'aprovado', 'reprovado')),
  link text default '',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists applications_owner_applied_idx
  on public.applications (owner_id, applied_at desc nulls last);

alter table public.applications enable row level security;

drop policy if exists "candidatura: ler as proprias" on public.applications;
create policy "candidatura: ler as proprias" on public.applications
  for select using (auth.uid() = owner_id);

drop policy if exists "candidatura: criar para si" on public.applications;
create policy "candidatura: criar para si" on public.applications
  for insert with check (auth.uid() = owner_id);

drop policy if exists "candidatura: atualizar as proprias" on public.applications;
create policy "candidatura: atualizar as proprias" on public.applications
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "candidatura: apagar as proprias" on public.applications;
create policy "candidatura: apagar as proprias" on public.applications
  for delete using (auth.uid() = owner_id);
