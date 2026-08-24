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


-- Uso e cache da IA ----------------------------------------------------------
--
-- Uma tabela só serve a dois propósitos, e isso é deliberado:
--
--   1. LIMITE DE USO — contar quantas chamadas o usuário fez na janela. Um
--      contador em memória não serviria: em plataforma serverless cada
--      requisição pode cair num processo diferente, e o contador zeraria
--      sozinho, deixando o limite como decoração.
--
--   2. CACHE — devolver a resposta guardada quando a mesma pergunta se repete.
--      Servir do cache NÃO cria linha nova, logo repetir a pergunta não
--      consome cota.
--
-- O texto de entrada NÃO é gravado aqui: só o fingerprint, que é um sha256. O
-- currículo já mora em public.resumes e não precisa de uma segunda cópia
-- espalhada. O `result` guarda a saída já validada por schema, e é conteúdo
-- derivado do currículo — por isso a exclusão de conta apaga esta tabela junto.

create table if not exists public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  task text not null,
  fingerprint text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- As duas consultas do produto são "contar por dono na janela" e "achar por
-- dono + fingerprint na janela". Este índice atende as duas: o prefixo
-- (owner_id, created_at) serve a contagem, e o fingerprint entra depois.
create index if not exists ai_calls_owner_created_idx
  on public.ai_calls (owner_id, created_at desc);

create index if not exists ai_calls_lookup_idx
  on public.ai_calls (owner_id, fingerprint, created_at desc);

alter table public.ai_calls enable row level security;

drop policy if exists "ia: ler as proprias" on public.ai_calls;
create policy "ia: ler as proprias" on public.ai_calls
  for select using (auth.uid() = owner_id);

drop policy if exists "ia: registrar para si" on public.ai_calls;
create policy "ia: registrar para si" on public.ai_calls
  for insert with check (auth.uid() = owner_id);

drop policy if exists "ia: apagar as proprias" on public.ai_calls;
create policy "ia: apagar as proprias" on public.ai_calls
  for delete using (auth.uid() = owner_id);

-- NÃO existe policy de update, e a falta é intencional: um registro de uso que
-- pode ser editado pelo próprio usuário não limita nada. A linha nasce e morre.

-- Limpeza. As consultas do app já filtram por created_at, então linha velha não
-- atrapalha resultado — só ocupa espaço. Rode isto periodicamente (pg_cron, ou
-- um agendamento da sua plataforma):
--
--   delete from public.ai_calls where created_at < now() - interval '30 days';


-- Permissões de tabela ------------------------------------------------------
--
-- ISTO NÃO É REDUNDANTE COM A RLS, e a diferença derrubou o app quando faltou.
-- São duas camadas independentes do Postgres:
--
--   GRANT decide se o papel PODE TOCAR na tabela;
--   RLS  decide QUAIS LINHAS ele enxerga depois de poder tocar.
--
-- Sem o GRANT, a RLS nem chega a ser avaliada: toda consulta morre em
-- "permission denied for table ...", inclusive de usuário logado. Este bloco
-- foi acrescentado depois de o app falhar exatamente assim num projeto novo —
-- o esquema confiava nas permissões padrão do Supabase em vez de declará-las,
-- e elas não vieram.
--
-- `anon` (visitante não autenticado) NÃO RECEBE NADA. Nenhuma tela deste
-- produto lê dado sem sessão, então o papel anônimo não precisa de acesso a
-- tabela nenhuma. O `revoke` também tira o TRUNCATE que vinha por padrão —
-- TRUNCATE ignora RLS, e ninguém deveria tê-lo aqui.
--
-- `authenticated` recebe EXATAMENTE as operações que têm política. Onde não há
-- política, não há permissão: as duas camadas dizem a mesma coisa, e a segunda
-- não vira uma brecha silenciosa se alguém mexer na primeira.
--
-- ⚠️ ESTES `grant` SOZINHOS NÃO GARANTEM O "EXATAMENTE" ACIMA: eles somam,
-- não subtraem, e o Supabase já concede privilégios por padrão. Quem tira as
-- sobras é o bloco SOBRAS DO PADRÃO DO SUPABASE, no fim do arquivo.

revoke all on public.profiles     from anon;
revoke all on public.resumes      from anon;
revoke all on public.applications from anon;
revoke all on public.ai_calls     from anon;

-- profiles: o perfil NASCE pelo gatilho `handle_new_user`, que roda como
-- `security definer` — por isso não há insert aqui.
grant select, update, delete on public.profiles to authenticated;

grant select, insert, update, delete on public.resumes      to authenticated;
grant select, insert, update, delete on public.applications to authenticated;

-- ai_calls: sem update, igual às políticas. Um registro de uso que o próprio
-- usuário pode editar não limita nada.
grant select, insert, delete on public.ai_calls to authenticated;


-- ---------------------------------------------------------------------------
-- COBRANÇA
--
-- Duas coisas acontecem neste bloco, e a primeira é uma CORREÇÃO DE SEGURANÇA
-- que vale mesmo para quem nunca ligar a cobrança.
-- ---------------------------------------------------------------------------


-- 1. O usuário não pode se promover a `pro` -----------------------------------
--
-- A política de update do perfil é por LINHA: `auth.uid() = id`. RLS não
-- restringe COLUNA. Enquanto o `grant` era `update` na tabela inteira, um
-- usuário logado podia chamar o Supabase direto com o próprio token e escrever
-- `plan = 'pro'` em si mesmo — o paywall inteiro contornável numa requisição.
--
-- Ninguém explorou porque não havia o que explorar: `AI_PAYWALL` nasceu
-- desligado e nada cobrava. O buraco só vira prejuízo no dia em que a cobrança
-- entra no ar, que é exatamente o dia em que ninguém está olhando para cá.
--
-- A correção é permissão por coluna, que é o mecanismo certo do Postgres para
-- isto. O usuário passa a poder editar SÓ o próprio nome. `plan` e `email`
-- ficam fora do alcance dele.
--
-- Quem escreve `plan` é o webhook de pagamento, com a chave `service_role`,
-- que ignora RLS e não depende destes grants.

revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;


-- 2. Pagamentos ---------------------------------------------------------------
--
-- Uma linha por tentativa de compra, criada ANTES de mandar a pessoa para o
-- provedor. Guardar só o "pago" perderia a única pista de quem tentou pagar e
-- não conseguiu — que é o suporte mais difícil de fazer sem registro.
--
-- `payment_ref` É ÚNICO, e é essa restrição que sustenta a idempotência.
-- Provedor de pagamento reenvia notificação: por retentativa, por instabilidade
-- da rede, ou porque alguém reprocessou um evento antigo no painel. Sem a
-- unicidade, o mesmo pagamento poderia ser processado duas vezes. Aqui a
-- segunda vez esbarra no banco, e não na boa vontade do código.
--
-- `amount_cents` em inteiro, nunca em float: 27.90 não existe em ponto
-- flutuante binário, e dinheiro que "quase" fecha é defeito que só aparece na
-- conciliação, meses depois.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'mercadopago',
  -- Id do "pedido" criado no provedor, antes de existir pagamento.
  preference_ref text,
  -- Id do pagamento em si. Nulo enquanto ninguém pagou; único quando existe.
  payment_ref text unique,
  status text not null default 'pendente'
    check (status in ('pendente', 'pago', 'recusado', 'cancelado', 'estornado')),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'BRL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_owner_idx on public.payments (owner_id, created_at desc);
create index if not exists payments_preference_idx on public.payments (preference_ref);

alter table public.payments enable row level security;

-- O usuário LÊ as próprias compras — a tela "meu plano" precisa disso.
drop policy if exists "pagamento: ler os proprios" on public.payments;
create policy "pagamento: ler os proprios" on public.payments
  for select using (auth.uid() = owner_id);

-- E SÓ LÊ. Não há política de insert, update ou delete para o usuário: toda
-- escrita passa pelo servidor com a chave `service_role`. Deixar o cliente
-- inserir a própria linha de pagamento significaria deixá-lo escolher o valor
-- e o status dela.

revoke all on public.payments from anon;
grant select on public.payments to authenticated;


-- ---------------------------------------------------------------------------
-- SOBRAS DO PADRÃO DO SUPABASE
--
-- Os `grant` acima são ADITIVOS: dizem o que `authenticated` passa a ter, não
-- o que ele deixa de ter. O Supabase concede privilégios por padrão a toda
-- tabela nova do schema `public`, e nada neste arquivo os retirava — só o
-- `anon` levava `revoke all`. Resultado: o bloco de grants declarava
-- "EXATAMENTE as operações que têm política" e as cinco tabelas carregavam
-- três privilégios a mais, silenciosamente.
--
-- Medido no banco em 24/08/2026: `REFERENCES`, `TRIGGER` e `TRUNCATE` em
-- `profiles`, `resumes`, `applications`, `ai_calls` e `payments`.
--
-- O QUE IMPORTA AQUI É O TRUNCATE. As políticas de RLS deste arquivo protegem
-- linha a linha, mas TRUNCATE NÃO É FILTRADO POR RLS: ele esvazia a tabela
-- inteira sem consultar política nenhuma. Uma policy que diz "cada um vê o seu"
-- não impede ninguém de apagar o de todos.
--
-- Hoje isso não é alcançável por um usuário do produto: o PostgREST não expõe
-- truncate, então um JWT de `authenticated` não chega lá — chegaria quem
-- tivesse conexão direta ao Postgres, e essa exige a senha do banco, não o
-- token. Por isso a correção é higiene, não incêndio. Mas privilégio que
-- ninguém pediu e ninguém usa é exatamente o que sobrevive a uma mudança
-- futura de superfície sem que alguém repare.
--
-- `REFERENCES` e `TRIGGER` vão junto pelo mesmo motivo: nenhum caminho do
-- produto cria chave estrangeira nem gatilho com a identidade do usuário.
--
-- Revogar privilégio que o papel não tem é no-op, então este bloco é
-- idempotente e pode rodar em qualquer ordem depois de as tabelas existirem.

revoke truncate, references, trigger on
  public.profiles,
  public.resumes,
  public.applications,
  public.ai_calls,
  public.payments
from authenticated;
