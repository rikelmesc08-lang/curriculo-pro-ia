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
-- RESERVA DE COTA DE IA NUM STATEMENT SÓ
--
-- `runWithBudget` (src/server/ai-budget.ts) grava uma reserva em `ai_calls`
-- antes de chamar a IA e pergunta qual é a POSIÇÃO dela na fila da janela. Se
-- o INSERT e as contagens vão ao banco separados, em READ COMMITTED (o padrão)
-- o SELECT de uma transação não enxerga a linha que outra ainda não commitou:
-- N requisições paralelas do mesmo usuário se acham todas a 1ª da fila e todas
-- passam, furando o teto de 15/hora e 40/dia. O prejuízo é custo de API real.
--
-- Esta função junta o INSERT e as duas contagens numa transação só e, antes de
-- tudo, pega uma trava POR USUÁRIO. A trava é o que fecha a corrida: a segunda
-- requisição do mesmo usuário espera a primeira commitar, e quando conta já
-- enxerga a linha dela. As posições saem 1, 2, 3… sem empate e sem buraco.
--
-- `pg_advisory_xact_lock` porque ela é solta sozinha no fim da transação,
-- inclusive em rollback — não existe caminho em que vaze e trave o usuário
-- para sempre. E é por `owner_id`, não global: dois usuários só se esbarram se
-- os hashes colidirem, e o custo disso é uma espera de milissegundos.
--
-- SECURITY INVOKER, DE PROPÓSITO. A função recebe `p_owner_id` como parâmetro.
-- Como `security definer`, esse parâmetro viraria um jeito de qualquer usuário
-- logado gravar linha no nome de outra pessoa e queimar a cota alheia. Como
-- invoker, ela roda com os poderes de quem chama e as policies de `ai_calls`
-- acima continuam valendo dentro dela — o INSERT com `owner_id` de terceiro é
-- recusado por "ia: registrar para si". NÃO troque para definer sem
-- acrescentar uma checagem explícita de `auth.uid() = p_owner_id`.
--
-- Os nomes de saída são `reserva_*`, e não `id`/`created_at`, porque num
-- `returns table` eles viram variáveis no corpo e sombreariam as colunas
-- homônimas de `ai_calls`.
-- ---------------------------------------------------------------------------

create or replace function public.reservar_chamada_ia(
  p_owner_id uuid,
  p_task text,
  p_fingerprint text,
  p_desde_hora timestamptz,
  p_desde_dia timestamptz
)
returns table (
  reserva_id uuid,
  reserva_criada_em timestamptz,
  posicao_hora bigint,
  posicao_dia bigint
)
language plpgsql
volatile
security invoker
-- `search_path` fixo: sem isto, um `search_path` hostil na sessão poderia
-- fazer `ai_calls` resolver para outra tabela. `pg_temp` por último, nunca
-- primeiro, para uma tabela temporária não sequestrar o nome.
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_criada_em timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));

  insert into public.ai_calls (owner_id, task, fingerprint, result)
  values (p_owner_id, p_task, p_fingerprint, '{}'::jsonb)
  returning ai_calls.id, ai_calls.created_at
  into v_id, v_criada_em;

  -- Contagem simples, sem comparar `(created_at, id)` — é a trava acima que
  -- torna isso correto. Comparar a tupla NÃO ordena por inserção: `created_at`
  -- tem precisão de milissegundo e o `id` é um UUID aleatório, então duas
  -- reservas no mesmo instante saem na ordem do sorteio e podem empatar de
  -- posição, furando o teto. Com a trava não há o que desempatar: nenhuma
  -- outra reserva deste usuário entra entre o INSERT e os SELECTs, e todas as
  -- anteriores já commitaram, então "quantas existem na janela" já É a posição.
  return query
  select
    v_id,
    v_criada_em,
    (
      select count(*)
      from public.ai_calls c
      where c.owner_id = p_owner_id
        and c.created_at >= p_desde_hora
    ),
    (
      select count(*)
      from public.ai_calls c
      where c.owner_id = p_owner_id
        and c.created_at >= p_desde_dia
    );
end;
$$;

-- O Postgres concede EXECUTE ao pseudo-papel `public` em toda função nova; sem
-- o revoke, o grant seletivo abaixo não restringiria nada. `anon` fica de fora
-- porque nenhuma tela deste produto chama IA sem login.
revoke all on function public.reservar_chamada_ia(uuid, text, text, timestamptz, timestamptz) from public;
revoke all on function public.reservar_chamada_ia(uuid, text, text, timestamptz, timestamptz) from anon;

grant execute on function public.reservar_chamada_ia(uuid, text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.reservar_chamada_ia(uuid, text, text, timestamptz, timestamptz) to service_role;


-- ---------------------------------------------------------------------------
-- COBRANÇA
--
-- Três coisas acontecem neste bloco, e a primeira é uma CORREÇÃO DE SEGURANÇA
-- que vale mesmo para quem nunca ligar a cobrança. A terceira é o grant que
-- faltou para `service_role`, e sem ele o webhook de pagamento não roda.
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
-- Quem escreve `plan` é o webhook de pagamento, com a chave `service_role`.
--
-- ⚠️ A frase que estava aqui dizia "que ignora RLS e não depende destes
-- grants" — ESTAVA ERRADA, e essa frase é a causa raiz de um 500 em produção.
-- `service_role` ignora RLS (tem BYPASSRLS: nenhuma policy o filtra), mas RLS
-- e GRANT são camadas diferentes do Postgres — a mesma distinção que abre o
-- bloco "Permissões de tabela" lá em cima. `service_role` NÃO IGNORA
-- privilégio de tabela: sem um `grant` explícito para ele, o mesmo
-- "permission denied for table ..." que este arquivo já tinha documentado
-- para `authenticated` também acontece com `service_role` — foi o que
-- derrubou `POST /app/upgrade` (`falha ao criar pagamento: permission denied
-- for table payments`), porque nenhuma tabela deste arquivo nunca teve grant
-- nenhum para `service_role`. Ver a nota completa junto do grant de
-- `payments`, na seção 2 abaixo.

revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

-- `service_role` toca `plan` só por UPDATE (`definirPlano`, em
-- src/lib/db/payments.ts). Mas UPDATE (plan) SOZINHO NÃO BASTA, e essa é uma
-- segunda causa raiz que só apareceu depois de ligar o pagamento de verdade:
-- `definirPlano` roda
--
--   update('profiles').set({ plan }).eq('id', ownerId)
--
-- e o Postgres cobra DOIS privilégios diferentes nessa única instrução —
-- documentado no capítulo "Privileges" da referência de UPDATE: UPDATE na(s)
-- coluna(s) do SET (`plan`, já concedido acima) E SELECT na(s) coluna(s)
-- referenciada(s) no WHERE (`id`), mesmo que a instrução nunca devolva linha
-- nenhuma (sem `.select()` encadeado, sem RETURNING). São checagens
-- independentes: uma cobre "pode mudar este valor", a outra cobre "pode
-- localizar a linha para mudar" — e SELECT no WHERE é exigido mesmo estando
-- ausente o RETURNING que motiva SELECT noutros lugares deste arquivo.
--
-- SEM O SELECT (id), o cenário é PIOR que o defeito original: o webhook do
-- Mercado Pago já confirmou `payments.status = 'pago'` — o cliente JÁ FOI
-- COBRADO — quando `definirPlano(ownerId, 'pro')`
-- (src/app/api/pagamento/webhook/route.ts:167) esbarra em "permission denied
-- for table profiles". Dinheiro cobrado, plano nunca vira `pro`, erro
-- servidor-a-servidor que ninguém no navegador vê. O defeito original ao
-- menos barrava a compra ANTES de cobrar; este barraria DEPOIS.
--
-- Coluna, não tabela inteira, pela mesma lógica do `authenticated` logo
-- acima: privilégio que ninguém pediu é exatamente o que sobra despercebido
-- numa mudança futura — e para `service_role`, que tem BYPASSRLS, o grant é
-- a ÚNICA trava que resta, não a segunda camada atrás da RLS. `id` é a única
-- coluna de `profiles` que qualquer instrução de `service_role` referencia
-- num WHERE hoje; `email`, `name` e `plan` continuam fora do alcance de
-- leitura dele. Raciocínio completo sobre o alcance de `service_role` na
-- seção 2.
grant update (plan) on public.profiles to service_role;
grant select (id) on public.profiles to service_role;


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


-- 3. service_role: exatamente o que o servidor toca --------------------------
--
-- `adminClient()` (src/lib/db/payments.ts, ~linha 32) é o ÚNICO lugar do
-- código que fala com o Postgres como `service_role` — a Server Action de
-- checkout, já autenticada, e o webhook do Mercado Pago, já com a assinatura
-- verificada. Nenhum outro módulo usa essa chave (conferido em
-- src/lib/db/supabase/client.ts, o cliente de sessão que todo o resto do app
-- usa, e que não tem caminho `service_role` — nem sequer carrega essa chave).
--
-- O que ele faz, lido em src/lib/db/payments.ts e não por suposição:
--
--   payments: SELECT, INSERT, UPDATE — nunca DELETE. criarPagamento insere;
--   buscarPagamento e listarPagamentos leem; anotarPreferencia e
--   liquidarPagamento atualizam. Nenhuma função do módulo apaga linha de
--   pagamento, e não seria desejável que apagasse: a tabela existe também
--   para guardar tentativa que falhou.
--
--   SELECT entra mesmo nas operações que "só escrevem", por DOIS motivos
--   independentes — não generalize para "todo insert/update precisa de
--   select", porque cada um se aplica a uma parte diferente da instrução:
--
--     1. RETURNING. criarPagamento e liquidarPagamento encadeiam
--        `.select(COLUNAS)` depois do insert/update, para devolver a linha
--        (um RETURNING, por baixo do PostgREST), e o Postgres cobra SELECT
--        nas colunas devolvidas como se fosse leitura.
--
--     2. WHERE. anotarPreferencia É A EXCEÇÃO que prova que o motivo 1 não
--        é geral: ela faz `.update(...).eq('id', paymentId)` SEM `.select()`
--        nenhum encadeado — não há RETURNING ali. Mesmo assim ela também
--        precisa de SELECT, porque toda `.eq(...)` vira uma cláusula WHERE, e
--        o Postgres cobra SELECT na(s) coluna(s) do WHERE independentemente
--        de haver RETURNING ou não (mesma regra documentada no grant de
--        `profiles`, seção 1 acima, onde a falta dela quebrou de verdade).
--
--   Os dois motivos pedem SELECT nas mesmas colunas de `payments` que o
--   grant de tabela inteira abaixo já cobre — por isso não há uma segunda
--   linha de grant só para o WHERE aqui, ao contrário de `profiles`, onde o
--   grant é por coluna e cada motivo teve que ser concedido explicitamente.
--
--   profiles: UPDATE (plan) e SELECT (id), já concedidos na seção 1 —
--   definirPlano é a única função do módulo que toca profiles, e seu WHERE
--   só referencia `id`.
--
-- POR QUE SÓ ESTAS DUAS TABELAS, E NÃO AS CINCO DO ARQUIVO — pesamos os dois
-- lados:
--
--   A favor de cobrir as cinco de uma vez: uma tabela nova que um dia passe a
--   precisar de `service_role` e for esquecida aqui quebra em produção do
--   mesmo jeito que `payments` acabou de quebrar — silenciosamente, só no
--   clique real, não em teste.
--
--   Contra, e é este que decide: para `authenticated`, GRANT é a SEGUNDA
--   trava — a RLS ainda filtra linha por linha atrás dela, então um grant
--   largo demais em `authenticated` é sobra, não é brecha por si só (é por
--   isso que o bloco SOBRAS DO PADRÃO DO SUPABASE, no fim do arquivo, trata a
--   sobra como higiene, e não como incêndio). Para `service_role`, que tem
--   BYPASSRLS, GRANT É A ÚNICA trava que sobra — não existe segunda camada
--   atrás dela. Dar a esta chave select/insert/update em resumes,
--   applications e ai_calls sem que nenhum código use isso hoje não destrava
--   produto nenhum — só aumenta o que um vazamento desta chave, ou um bug
--   futuro que chame `adminClient()` na tabela errada, alcançaria. É o mesmo
--   raciocínio do bloco SOBRAS DO PADRÃO DO SUPABASE, aplicado à chave que
--   menos tolera sobra, porque é a única sem RLS para segurar o resto.
--
-- Decisão: só payments e profiles, só as operações usadas hoje. Se um dia
-- resumes, applications ou ai_calls precisarem de `service_role` — um job de
-- limpeza de `ai_calls`, por exemplo —, o grant entra junto com aquele
-- código, do lado da tabela que ele toca, com o mesmo raciocínio escrito
-- aqui. É o mesmo motivo pelo qual a "tabela nova esquecida" some deste
-- arquivo: quem adicionar acesso privilegiado novo tem, bem aqui do lado, o
-- lembrete de que GRANT para `service_role` não é automático neste projeto.
--
-- Este grant é aditivo e idempotente, como os demais deste arquivo: rodar de
-- novo não soma nem retira nada.

grant select, insert, update on public.payments to service_role;


-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO
--
-- Este bloco fica ANTES de SOBRAS DO PADRÃO DO SUPABASE de propósito: o
-- restante do arquivo já chama aquele bloco de "fim do arquivo" em dois
-- comentários diferentes (linhas 236 e 438) — mover VERIFICAÇÃO para depois
-- quebraria essa referência. Então SOBRAS continua sendo o último bloco, e
-- VERIFICAÇÃO entra logo antes dele, não depois.
--
-- Cole SÓ a consulta abaixo (sem o `--` de comentário) no editor SQL do
-- Supabase depois de rodar este arquivo, para conferir os grants sem depender
-- de rolar a grade de resultados do painel — ela é de PROPÓSITO agregada numa
-- linha só com `string_agg`, porque o painel mostra 5 linhas por vez e some
-- entre rolagens.
--
-- Ela junta duas fontes do catálogo porque um grant de TABELA e um grant de
-- COLUNA aparecem em lugares diferentes do information_schema:
--   `table_privileges` só mostra privilégio concedido na tabela inteira;
--   `column_privileges` mostra o que foi concedido por `grant ... (coluna)`,
--   como `update (name)`, `update (plan)` e `select (id)` deste arquivo — eles
--   NÃO aparecem em `table_privileges`, mesmo existindo de verdade.
--
-- select
--   (select string_agg(table_name || '/' || grantee || '=' || privs, '; ' order by table_name, grantee)
--    from (
--      select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
--      from information_schema.table_privileges
--      where table_schema = 'public'
--        and table_name in ('profiles','resumes','applications','ai_calls','payments')
--        and grantee in ('anon','authenticated','service_role')
--      group by table_name, grantee
--    ) s) as privilegios_de_tabela,
--   (select string_agg(table_name || '.' || column_name || '/' || grantee || '=' || privilege_type,
--                       '; ' order by table_name, column_name, grantee)
--    from information_schema.column_privileges
--    where table_schema = 'public'
--      and table_name = 'profiles'
--      and column_name in ('name', 'plan', 'id')
--      and grantee in ('authenticated', 'service_role')
--   ) as privilegios_de_coluna_profiles;
--
-- RESULTADO ESPERADO depois deste arquivo, uma linha só:
--
--   privilegios_de_tabela deve conter, entre outros:
--     payments/authenticated=SELECT
--     payments/service_role=INSERT,SELECT,UPDATE
--     ai_calls/authenticated=DELETE,INSERT,SELECT
--     applications/authenticated=DELETE,INSERT,SELECT,UPDATE
--     resumes/authenticated=DELETE,INSERT,SELECT,UPDATE
--   e NÃO deve conter nenhuma entrada de `anon`, nem `UPDATE` para
--   `profiles/authenticated` ou `profiles/service_role` — os updates de
--   `profiles` são só por coluna e por isso não aparecem aqui (ver acima).
--
--   privilegios_de_coluna_profiles deve conter ESTAS TRÊS LINHAS, mais três
--   que não são bug — leia a ressalva abaixo antes de estranhar a contagem:
--     profiles.id/service_role=SELECT
--     profiles.name/authenticated=UPDATE
--     profiles.plan/service_role=UPDATE
--
--   ⚠️ TAMBÉM VÊM, e não são vazamento de privilégio: `profiles.id/
--   authenticated=SELECT`, `profiles.name/authenticated=SELECT` e
--   `profiles.plan/authenticated=SELECT`. `column_privileges` expande TODO
--   grant de tabela inteira numa linha por coluna, incondicionalmente — e
--   `authenticated` tem `select` de tabela inteira em `profiles` desde a
--   linha 245 (`grant select, update, delete on public.profiles to
--   authenticated;`); só o UPDATE foi revogado depois, na linha 294. O SELECT
--   de tabela inteira nunca foi revogado, e não deveria ser: a política RLS
--   "perfil: ler o proprio" já é a barreira certa para leitura de `profiles`,
--   igual às outras quatro tabelas do arquivo — a coluna aqui só restringe
--   ESCRITA, que é onde RLS não filtra por coluna. Contando as três de cima
--   com estas três, `privilegios_de_coluna_profiles` traz seis linhas ao
--   todo, não três.
--
-- Se `payments/service_role` ou qualquer uma das três linhas de
-- `profiles.*/service_role` vier ausente, o grant correspondente não rodou —
-- volte a este arquivo e rode a seção 1 ou a seção 3 de COBRANÇA de novo.


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
