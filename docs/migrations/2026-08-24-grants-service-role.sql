begin;

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
-- existe, não toca em `resumes`, `applications` nem `ai_calls`.
--
-- IDEMPOTÊNCIA. Rodar este arquivo 1, 2 ou 10 vezes produz o mesmo estado.
-- `grant`/`revoke` são idempotentes por definição do Postgres (conceder ou
-- revogar de novo o que já está concedido/revogado é no-op). `create table
-- if not exists`, `create index if not exists` e `alter table ... enable row
-- level security` também são. A única forma que não é idempotente por conta
-- própria é `create policy`, e por isso ela vem sempre precedida de
-- `drop policy if exists` com o mesmo nome — o mesmo padrão já usado em
-- docs/schema.sql.
--
-- ATOMICIDADE. O `begin;` na primeira linha e o `commit;` logo antes da
-- seção de VERIFICAÇÃO não são decoração: sem eles, o arquivo dependeria de
-- um comportamento IMPLÍCITO do editor SQL do Supabase (tratar o paste como
-- transação única), e isso não é garantido por nada. Se o editor não abrir
-- uma transação só e o script falhar no meio, `payments` pode ficar sem a
-- policy de SELECT por um instante — RLS nega tudo por padrão, então nenhum
-- dado vaza, mas a tela "meu plano" quebra visivelmente até alguém rodar de
-- novo. `begin`/`commit` explícitos fecham essa dúvida: ou o arquivo inteiro
-- aplica, ou nada aplica.
--
-- ⚠️ AVISO — POR ISSO COLE O ARQUIVO INTEIRO, NUNCA UM PEDAÇO. O `begin`/
-- `commit` acima resolve o problema de atomicidade, mas abre um risco novo
-- que não existia antes dele, e por honestidade ele precisa estar escrito
-- aqui: `grant` e `revoke` pedem ACCESS EXCLUSIVE LOCK na tabela que tocam —
-- a linha `revoke all on public.payments from anon;`, no bloco A logo
-- abaixo, trava a tabela `payments` INTEIRA até a transação fechar com
-- `commit;`. Se o Ctrl+A falhar, ou você colar só até o meio do arquivo sem
-- alcançar o `commit;` no fim, a sessão fica parada com uma transação ABERTA
-- segurando esse lock — e, se o editor do Supabase mantiver a conexão viva
-- entre uma execução e outra, toda leitura e escrita em `payments` e
-- `profiles` em PRODUÇÃO passa a ENFILEIRAR: a tela "meu plano", o checkout
-- e o próprio webhook do Mercado Pago param de responder, até alguém
-- cancelar a query no painel ou o servidor estourar o tempo limite. Na
-- versão anterior deste arquivo, sem `begin`/`commit`, um paste parcial só
-- fazia trabalho incompleto e idempotente — sem travar nada; o ganho de
-- atomicidade compensa esse risco, mas só se você seguir a regra: cole
-- SEMPRE do `begin;` da primeira linha até a ÚLTIMA linha do arquivo, de uma
-- vez só. E se a query parecer travada — rodando por muito tempo sem
-- terminar — NÃO feche a aba em silêncio: cancele a query ativa no painel do
-- Supabase antes de tentar de novo.
--
-- NÃO É DESTRUTIVA. Este arquivo não derruba tabela, não apaga coluna, não
-- perde dado. Só soma privilégio que faltava. Se o bloco COBRANÇA de
-- docs/schema.sql (tabela `payments`, RLS, policy de SELECT do dono, revoke
-- de UPDATE amplo em `profiles`) já rodou — e a investigação confirmou no
-- catálogo do Postgres que já rodou, em 24/08/2026 — os blocos A e B abaixo
-- não fazem nada de novo; só o bloco C (os grants de `service_role`) muda
-- algo.
-- ---------------------------------------------------------------------------


-- Guarda de pré-condição -------------------------------------------------
--
-- Esta migration é um DELTA sobre o esquema base, não uma instalação do
-- zero. Se `public.profiles` não existir, o banco nunca rodou
-- docs/schema.sql, e tentar seguir em frente de forma condicional deixaria
-- o banco pela metade (payments criada, mas sem gatilho de perfil, sem as
-- outras quatro tabelas, sem os grants de authenticated). Falha alto e claro
-- em vez de mascarar isso com "if not exists" por todo canto — e, dentro da
-- transação aberta acima, essa falha desfaz qualquer coisa que este arquivo
-- já tivesse feito antes dela.

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
end $$;


-- ---------------------------------------------------------------------------
-- A. Rede de segurança: tabela `payments`, RLS e policy do dono
--
-- Reprodução idêntica do bloco COBRANÇA / seção 2 de docs/schema.sql. Existe
-- aqui só para o caso de o bloco COBRANÇA não ter rodado neste banco por
-- algum motivo — o usuário não tem como confirmar isso com certeza. Se a
-- tabela já existe com esta estrutura, `create table if not exists` não faz
-- nada; se a policy já existe, `drop policy if exists` a remove e a
-- `create policy` seguinte recria a mesma coisa — resultado final idêntico.
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

drop policy if exists "pagamento: ler os proprios" on public.payments;
create policy "pagamento: ler os proprios" on public.payments
  for select using (auth.uid() = owner_id);

revoke all on public.payments from anon;
grant select on public.payments to authenticated;


-- ---------------------------------------------------------------------------
-- B. Rede de segurança: coluna `plan` de `profiles` fora do alcance do dono
--
-- Reprodução idêntica do bloco COBRANÇA / seção 1 de docs/schema.sql (a
-- parte que já rodou). `revoke`/`grant` são idempotentes: se já rodou, isto
-- é no-op.
-- ---------------------------------------------------------------------------

revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;


-- ---------------------------------------------------------------------------
-- C. O QUE ESTA MIGRATION REALMENTE ACRESCENTA: grants para service_role
--
-- Isto é o único pedaço deste arquivo que, até a data acima, nunca foi
-- confirmado como executado neste banco. É a causa do 500 em produção.
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

commit;


-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO
--
-- Já roda como parte deste mesmo script — cole o arquivo inteiro, clique
-- Run uma vez, e o resultado abaixo aparece direto no painel, sem precisar
-- abrir uma segunda query nem editar texto nenhum. É um `select` puro, sem
-- efeito colateral, seguro para reexecutar quantas vezes quiser.
--
-- Agregada numa linha só com `string_agg` de propósito: a grade de
-- resultados do painel do Supabase mostra 5 linhas por vez e o resultado
-- some ao rolar.
--
-- Junta duas fontes do catálogo porque grant de TABELA e grant de COLUNA
-- aparecem em lugares diferentes do information_schema — `table_privileges`
-- não mostra `grant select (id) on ... to service_role`, só grant de tabela
-- inteira; quem mostra isso é `column_privileges`.
-- ---------------------------------------------------------------------------

select
  (select string_agg(table_name || '/' || grantee || '=' || privs, '; ' order by table_name, grantee)
   from (
     select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
     from information_schema.table_privileges
     where table_schema = 'public'
       and table_name = 'payments'
       and grantee in ('anon', 'authenticated', 'service_role')
     group by table_name, grantee
   ) s) as privilegios_de_tabela_payments,
  (select string_agg(table_name || '.' || column_name || '/' || grantee || '=' || privilege_type,
                      '; ' order by table_name, column_name, grantee)
   from information_schema.column_privileges
   where table_schema = 'public'
     and table_name = 'profiles'
     and column_name in ('id', 'plan')
     and grantee = 'service_role'
  ) as privilegios_de_coluna_profiles_service_role;

-- RESULTADO ESPERADO, uma linha só, se esta migration rodou com sucesso:
--
--   privilegios_de_tabela_payments deve conter, entre outros:
--     payments/authenticated=SELECT
--     payments/service_role=INSERT,SELECT,UPDATE
--   e NÃO deve conter nenhuma entrada de `anon`.
--
--   privilegios_de_coluna_profiles_service_role deve conter EXATAMENTE:
--     profiles.id/service_role=SELECT; profiles.plan/service_role=UPDATE
--
-- SE APARECER MENSAGEM DE ERRO EM VERMELHO, EM VEZ DO RESULTADO ACIMA: é
-- ESPERADO, não é defeito desta consulta. Este arquivo inteiro roda como UMA
-- transação (`begin;` no topo, `commit;` antes desta seção) e não tem nenhum
-- tratamento de erro por dentro — qualquer erro entre essas duas linhas
-- interrompe a execução ali mesmo, e a consulta de verificação, que vem
-- DEPOIS do `commit;`, nunca chega a rodar. Você não vai ver grade de
-- resultado nenhuma, só a mensagem de erro em vermelho — e é isso mesmo que
-- deve acontecer.
--
-- Por causa do `begin`/`commit`, um erro ali significa que NADA foi alterado
-- no banco: a transação inteira foi desfeita, e o estado de `payments` e de
-- `profiles` continua exatamente igual ao que era antes de você colar este
-- arquivo.
--
-- O que fazer: leia a mensagem de erro — ela diz a causa (por exemplo,
-- "public.profiles não existe" é a guarda de pré-condição deste arquivo
-- avisando que docs/schema.sql ainda não rodou neste banco) —, resolva essa
-- causa, e rode o arquivo INTEIRO de novo, do começo. Não tem como "rodar só
-- o pedaço que faltou": o arquivo é idempotente de propósito, então rodá-lo
-- de novo do zero não tem efeito colateral nenhum.
