-- ---------------------------------------------------------------------------
-- Migration: grants de service_role para o checkout de pagamento funcionar
-- Data: 2026-08-24
--
-- POR QUE ESTA MIGRATION EXISTE. `POST /app/upgrade` respondeu 500 em
-- produção: "falha ao criar pagamento: permission denied for table
-- payments". Causa: `service_role` (a chave usada por `adminClient()` em
-- src/lib/db/payments.ts, linha 32) tem BYPASSRLS — ignora toda policy de RLS
-- — mas RLS e GRANT são camadas diferentes do Postgres, e `service_role` NÃO
-- ignora GRANT de tabela. Nenhuma tabela deste projeto jamais teve grant
-- nenhum para `service_role`; a tabela `payments` foi criada, ganhou RLS e
-- policy, mas ninguém concedeu a ele o direito de tocá-la.
--
-- Segunda causa, mais grave, encontrada na mesma investigação:
-- `definirPlano` (src/lib/db/payments.ts, linha 263) roda
-- `update('profiles').set({ plan }).eq('id', ownerId)`. O Postgres cobra
-- UPDATE na(s) coluna(s) do SET *e* SELECT na(s) coluna(s) do WHERE, mesmo
-- sem RETURNING. Sem `grant select (id)`, o webhook falharia DEPOIS de o
-- Mercado Pago já ter confirmado o pagamento — pior que o defeito original,
-- que ao menos barra a compra ANTES de cobrar.
--
-- ESCOPO. Só o que falta para o pagamento funcionar: grants para
-- `service_role` em `payments` e em duas colunas de `profiles`. Não recria
-- tabela que já existe com a estrutura certa, não mexe em policy que já
-- existe (a não ser para garanti-la, de forma condicional — ver Seção 2),
-- não toca em `resumes`, `applications` nem `ai_calls`.
--
-- IDEMPOTÊNCIA E POR QUE NÃO HÁ `begin`/`commit` NESTE ARQUIVO. Todo
-- statement abaixo é idempotente sozinho: `grant`/`revoke` são idempotentes
-- por definição do Postgres; `create table if not exists`, `create index if
-- not exists` e `alter table ... enable row level security` também são. A
-- ÚNICA peça deste arquivo que não era idempotente por conta própria era
-- `create policy` — a versão anterior resolvia isso com
-- `drop policy if exists` na frente, o que abre uma janela sem policy no meio
-- da execução, e por isso o arquivo inteiro vinha embrulhado em
-- `begin`/`commit` para fechar essa janela. Esta versão troca o par
-- drop+create por uma criação CONDICIONAL de verdade (Seção 2: só cria a
-- policy se ela ainda não existir, consultando `pg_policies` dentro de um
-- `do $$ ... $$`). Sem `drop`, não existe remoção, não existe janela, e sem
-- janela não é preciso transação. Cada statement deste arquivo agora roda
-- isolado, em qualquer ordem de execução parcial, sem deixar o banco pela
-- metade nem depender de um `commit` que alcance o fim do arquivo.
--
-- ⚠️ AVISO — O RISCO REAL NÃO É TRAVAR A TABELA, É O BOTÃO "RUN SELECTED".
-- Em 24/08/2026 este arquivo (então com `begin`/`commit`) foi colado no
-- editor SQL do Supabase, o botão foi clicado, e a tela mostrou
-- "Success. No rows returned". PARECIA aplicado. NÃO ESTAVA: nenhum dos três
-- grants de `service_role` foi de fato concedido — confirmado depois
-- consultando o catálogo do Postgres (payments: 0 de 3, profiles: 0 de 2).
--
-- O motivo: o editor SQL do Supabase muda o texto do botão para
-- "Run selected" sempre que existe QUALQUER seleção de texto na tela — e
-- nesse modo ele roda SÓ o trecho selecionado, não o arquivo inteiro. A
-- seleção daquele dia não alcançou o fim do arquivo; o `commit;` de então
-- ficou de fora; o Postgres desfez tudo sozinho quando a conexão voltou para
-- o pool sem commit — e como nenhum comando individual falhou, o painel
-- reportou "Success" mesmo assim.
--
-- Para quem não é de banco de dados, em três frases:
--   1. Antes de clicar em Run, olhe o texto do botão. Se disser
--      "Run selected" em vez de só "Run", tem texto selecionado, e SÓ ESSE
--      texto vai rodar.
--   2. O jeito seguro é não deixar nada selecionado — clique uma vez dentro
--      do editor para tirar qualquer seleção antes de rodar — ou, se for
--      colar e rodar tudo, dar Ctrl+A para selecionar o arquivo INTEIRO de
--      propósito, de cima a baixo, antes de clicar em Run.
--   3. "Success" na tela NÃO é prova de que aplicou. A prova é a consulta de
--      VERIFICAÇÃO no fim deste arquivo devolver `TUDO CERTO`. Rode-a
--      sempre, depois, e leia o texto que ela devolve — não só se apareceu
--      em verde ou vermelho.
--
-- Nesta versão do arquivo o risco de um "Run selected" acidental é bem menor
-- mesmo que se repita: como não há mais `begin`/`commit`, uma seleção
-- parcial que ao menos alcance a Seção 1 (os três grants, logo abaixo da
-- guarda de pré-condição) já aplica o que realmente importa, e aplica de
-- verdade — sem depender de chegar até o fim do arquivo. Ainda assim, cole e
-- rode o arquivo INTEIRO sempre que possível: é a única forma de também
-- garantir a rede de segurança (Seção 2 e 3) e de ver o veredito da
-- VERIFICAÇÃO no mesmo Run.
--
-- NÃO É DESTRUTIVA. Este arquivo não derruba tabela, não apaga coluna, não
-- perde dado. Só soma privilégio que faltava (e garante, de forma
-- condicional, uma policy que já deveria existir).
--
-- HISTÓRICO. 24/08/2026: este arquivo, na versão anterior (com
-- `begin`/`commit`), rodou no editor SQL do Supabase, reportou
-- "Success. No rows returned" e não aplicou nenhum dos três grants — vítima
-- do "Run selected" descrito acima. O banco foi corrigido na hora, à mão,
-- com os três `grant` soltos, sem transação. Esta versão do arquivo existe
-- para que a mesma armadilha não se repita da próxima vez que alguma
-- migration precisar rodar aqui.
-- ---------------------------------------------------------------------------


-- Guarda de pré-condição -------------------------------------------------
--
-- Esta migration é um DELTA sobre o esquema base, não uma instalação do
-- zero. Confere as duas coisas que os grants da Seção 1, logo abaixo,
-- precisam encontrar prontas: a tabela `profiles` (base do projeto) e a
-- tabela `payments` (criada pelo bloco COBRANÇA de docs/schema.sql, já
-- confirmado no catálogo como aplicado em produção em 24/08/2026). Falha
-- alto e claro, com mensagem que diz o que falta, em vez de deixar o
-- `grant ... on public.payments` logo abaixo estourar um
-- "relation does not exist" sem contexto nenhum.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    raise exception
      'public.profiles não existe — rode docs/schema.sql inteiro primeiro. '
      'Esta migration só soma grants de service_role sobre um esquema base já instalado, não instala o esquema base.';
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'payments'
  ) then
    raise exception
      'public.payments não existe — rode docs/schema.sql inteiro primeiro (bloco COBRANÇA). '
      'Os grants da Seção 1 deste arquivo pressupõem que a tabela payments já foi criada.';
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- Seção 1. GRANTS DE SERVICE_ROLE — o que este arquivo REALMENTE precisa
-- aplicar
--
-- É o único pedaço deste arquivo que, até a data no topo, nunca havia sido
-- confirmado como executado neste banco. É a causa do 500 em produção.
-- Fica logo depois da guarda de pré-condição, antes de qualquer rede de
-- segurança redundante, de propósito: se alguém rodar só o começo do
-- arquivo — por exemplo, por causa do "Run selected" descrito no aviso do
-- topo — o que importa já foi aplicado.
--
-- Cada grant abaixo é justificado pela função de src/lib/db/payments.ts que
-- o exige — nada além disso é concedido, porque para `service_role` (que tem
-- BYPASSRLS) o GRANT é a ÚNICA trava que existe; não há RLS atrás dele.
-- ---------------------------------------------------------------------------

-- profiles.plan — UPDATE. Exigido por `definirPlano` (payments.ts, linha
-- 263): `update('profiles').set({ plan }).eq('id', ownerId)`. É o único
-- lugar do sistema que muda o plano de alguém, e só depois do webhook do
-- Mercado Pago confirmar o pagamento.
grant update (plan) on public.profiles to service_role;

-- profiles.id — SELECT. Exigido pela MESMA chamada de `definirPlano`: o
-- `.eq('id', ownerId)` vira cláusula WHERE, e o Postgres cobra SELECT na
-- coluna do WHERE mesmo sem RETURNING nenhum. Sem este grant, o UPDATE
-- acima falha com "permission denied" depois de o cliente já ter pago.
grant select (id) on public.profiles to service_role;

-- payments — SELECT, INSERT, UPDATE (tabela inteira; nunca DELETE).
-- Exigido por cinco funções de payments.ts:
--   criarPagamento (linha 97): INSERT em id/owner_id/provider/status/
--     amount_cents/currency, e SELECT pelo `.select(COLUNAS)` encadeado que
--     devolve a linha criada (RETURNING).
--   anotarPreferencia (linha 140): UPDATE em preference_ref/updated_at, e
--     SELECT em `id` pelo `.eq('id', paymentId)` do WHERE — sem RETURNING
--     aqui, mas o WHERE cobra SELECT do mesmo jeito.
--   buscarPagamento (linha 158) e listarPagamentos (linha 169): SELECT puro
--     nas 10 colunas de COLUNAS.
--   liquidarPagamento (linha 206): UPDATE em payment_ref/status/updated_at,
--     mais SELECT pelo WHERE (`id`) e pelo RETURNING (`.select(COLUNAS)`).
-- Nenhuma função apaga linha de `payments`, por isso não há DELETE aqui.
--
-- Concedido na tabela inteira, não por coluna — mas não porque os UPDATEs,
-- isolados, escrevam todas as colunas: eles não escrevem. anotarPreferencia
-- toca só preference_ref/updated_at; liquidarPagamento toca só
-- payment_ref/status/updated_at. O motivo real é que, ao contrário de
-- `profiles`, aqui não existe NENHUMA coluna que precise ficar fora do
-- alcance de `service_role` — não há equivalente a `plan`, um valor que o
-- próprio cliente privilegiado não deveria poder escrever livremente. E o
-- SELECT de tabela inteira já expõe as 10 colunas de qualquer forma (soma de
-- RETURNING + leituras diretas das quatro funções acima), então fatiar o
-- INSERT/UPDATE por coluna não reduziria superfície de ataque nenhuma —
-- só acrescentaria manutenção sem ganho de segurança real.
grant select, insert, update on public.payments to service_role;


-- ---------------------------------------------------------------------------
-- Seção 2. Rede de segurança: tabela `payments`, índice, RLS e policy do
-- dono
--
-- Reprodução idêntica do bloco COBRANÇA / seção 2 de docs/schema.sql — existe
-- aqui só para o caso de aquele bloco não ter aplicado tudo neste banco (a
-- guarda de pré-condição já garantiu que a TABELA existe, mas não garante
-- que o índice, a RLS e a policy também foram aplicados). Na prática, tudo
-- isto já existe em produção; é rede de segurança, não a razão de este
-- arquivo existir.
--
-- `create table if not exists`, `create index if not exists` e
-- `alter table ... enable row level security` são idempotentes sozinhos.
--
-- A policy é a única peça que não seria idempotente com um simples
-- `create policy` — Postgres não tem `create policy if not exists`. A versão
-- anterior deste arquivo resolvia isso com `drop policy if exists` +
-- `create policy`, o que abre uma janela sem policy entre as duas linhas
-- (RLS nega tudo por padrão nessa janela, então nenhum dado vaza — mas a
-- tela "meu plano" quebraria até a `create policy` seguinte rodar), e por
-- isso o arquivo inteiro precisava de `begin`/`commit` para fechar essa
-- janela. Esta versão evita o dilema: consulta `pg_policies` e só cria a
-- policy se ela ainda não existir. Sem `drop`, não há remoção, não há
-- janela, e este bloco roda isolado quantas vezes for preciso.
-- ---------------------------------------------------------------------------

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'mercadopago',
  preference_ref text,
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

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payments'
      and policyname = 'pagamento: ler os proprios'
  ) then
    execute
      'create policy "pagamento: ler os proprios" on public.payments '
      'for select using (auth.uid() = owner_id)';
  end if;
end $$;

revoke all on public.payments from anon;
grant select on public.payments to authenticated;


-- ---------------------------------------------------------------------------
-- Seção 3. Rede de segurança: coluna `plan` de `profiles` fora do alcance do
-- dono
--
-- Reprodução idêntica do bloco COBRANÇA / seção 1 de docs/schema.sql (a
-- parte que já rodou). `revoke`/`grant` são idempotentes: se já rodou, isto
-- é no-op.
-- ---------------------------------------------------------------------------

revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;


-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO
--
-- Roda como parte deste mesmo script — cole o arquivo inteiro (nada
-- selecionado, ou Ctrl+A de propósito antes de rodar — ver aviso no topo),
-- clique Run uma vez, e o veredito abaixo aparece direto no painel.
--
-- Uma coluna só, com um texto curto: `TUDO CERTO` ou `FALTANDO -- ...`. A
-- versão anterior desta consulta usava `string_agg` para juntar tudo numa
-- linha só, e o painel do Supabase corta a célula na largura da coluna — no
-- incidente de 24/08/2026 isso fez o dono do projeto ler só
-- "payments/authenticated=SELECT" na tela e concluir, errado, que faltava o
-- resto (que estava lá, só escondido pelo corte). Um veredito curto de uma
-- palavra ou uma contagem não tem como enganar assim.
-- ---------------------------------------------------------------------------

select
  case
    when p.n = 3 and c.n = 2 then 'TUDO CERTO'
    else 'FALTANDO -- payments: ' || p.n || ' de 3, profiles: ' || c.n || ' de 2'
  end as resultado
from
  (select count(*) as n from information_schema.table_privileges
    where table_schema = 'public' and table_name = 'payments' and grantee = 'service_role'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE')) p,
  (select count(*) as n from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles' and grantee = 'service_role'
      and ((column_name = 'id' and privilege_type = 'SELECT')
        or (column_name = 'plan' and privilege_type = 'UPDATE'))) c;

-- Se aparecer `FALTANDO -- ...`: releia o aviso do topo sobre "Run selected"
-- — é a causa mais provável — e rode o arquivo INTEIRO de novo. Cada
-- statement deste arquivo é idempotente e seguro para repetir; não existe
-- "rodar só o pedaço que faltou" que quebre alguma coisa.
--
-- Se aparecer mensagem de erro em vermelho em vez de uma linha com
-- `resultado`: leia a mensagem — ela diz a causa (por exemplo,
-- "public.profiles não existe" ou "public.payments não existe" é a guarda de
-- pré-condição deste arquivo avisando que docs/schema.sql ainda não rodou
-- neste banco) —, resolva essa causa, e rode o arquivo inteiro de novo.
