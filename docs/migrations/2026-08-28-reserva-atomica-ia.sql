-- ---------------------------------------------------------------------------
-- Migration: reserva de cota de IA num statement só, para fechar a corrida
-- Data: 2026-08-28
--
-- POR QUE ESTA MIGRATION EXISTE. `runWithBudget` (src/server/ai-budget.ts)
-- reserva a cota gravando uma linha em `ai_calls` ANTES de chamar a IA, e
-- depois pergunta ao banco qual é a POSIÇÃO dessa reserva na fila da janela
-- (últimos 60 min e últimas 24 h). Se a posição passa do limite, a reserva é
-- desfeita e a análise nem começa.
--
-- Isso fecha a corrida por completo no driver `local`, porque lá o arquivo é
-- acessado por uma fila única que serializa toda leitura e escrita. No
-- Supabase NÃO fecha, e o motivo não é o código do app — é o nível de
-- isolamento do Postgres:
--
--   * o INSERT da reserva é uma ida ao banco;
--   * cada contagem é OUTRA ida, em transação própria;
--   * em READ COMMITTED (o padrão), o SELECT de uma transação NÃO enxerga a
--     linha que outra transação inseriu mas ainda não commitou.
--
-- Ou seja: N requisições paralelas do mesmo usuário podem inserir suas N
-- reservas e, em seguida, cada uma contar sem ver as outras — todas se acham
-- a 1ª da fila e todas passam. A janela deixou de ser "uma chamada de IA
-- inteira" (segundos) e virou "um INSERT e dois SELECTs" (milissegundos), que
-- é uma melhora real e foi o que a correção de 27/08 entregou. Mas milissegundo
-- não é zero, e o prejuízo de furar o teto é custo de API de verdade.
--
-- O QUE ESTA FUNÇÃO FAZ DE DIFERENTE. Junta o INSERT e as duas contagens numa
-- transação só e, antes de tudo, pega uma TRAVA POR USUÁRIO. A trava é o que
-- de fato fecha a corrida: a segunda requisição do mesmo usuário fica parada
-- na chamada até a primeira commitar, e quando ela finalmente conta, a linha
-- da primeira JÁ ESTÁ COMMITADA e visível. As posições saem 1, 2, 3… sem
-- empate e sem buraco, exatamente como saem no driver local.
--
-- `pg_advisory_xact_lock` e não uma tabela de contador: a trava é solta
-- sozinha no fim da transação, inclusive se a transação abortar. Não existe
-- caminho em que ela vaze e trave o usuário para sempre — que é o risco de
-- qualquer trava que precise ser liberada à mão.
--
-- A trava é por USUÁRIO, não global: o `hashtextextended` do `owner_id` dá o
-- número da trava. Dois usuários diferentes só se esbarram se os hashes
-- colidirem, e o custo de uma colisão é uma espera de milissegundos, não um
-- erro. O contrário — uma trava global — serializaria o produto inteiro.
--
-- SECURITY INVOKER, DE PROPÓSITO, E ISTO É A PARTE DELICADA.
-- A função recebe `p_owner_id` como PARÂMETRO. Se ela fosse `security
-- definer`, rodaria com os poderes de quem a criou e o parâmetro viraria um
-- jeito de qualquer usuário logado gravar linha no nome de outra pessoa —
-- queimando a cota alheia, ou poluindo o registro de uso de terceiros. Com
-- `security invoker` (o padrão, escrito aqui para ficar explícito) a função
-- roda com os poderes de QUEM CHAMA, e as policies de RLS que `ai_calls` já
-- tem desde o esquema inicial continuam valendo dentro dela:
--
--   "ia: registrar para si"  → insert with check (auth.uid() = owner_id)
--   "ia: ler as proprias"    → select using (auth.uid() = owner_id)
--
-- Passar o `owner_id` de outra pessoa não furta cota: o INSERT é recusado pela
-- policy. NÃO troque para `security definer` sem acrescentar, dentro da
-- função, uma checagem explícita de `auth.uid() = p_owner_id`.
--
-- O app chama isto com a chave `anon` mais a sessão do usuário — não existe
-- caminho `service_role` no driver de dados (ver src/lib/db/supabase/client.ts).
-- Por isso `authenticated` é quem realmente precisa do grant.
--
-- NÃO É DESTRUTIVA. Só cria uma função. Nenhuma linha é lida, alterada ou
-- apagada pela aplicação desta migration; nenhuma coluna, índice ou policy
-- muda. Rodar duas vezes é inofensivo (`create or replace`).
--
-- COMPATÍVEL COM O CÓDIGO ANTIGO NOS DOIS SENTIDOS, e isso é o que permite
-- aplicar em produção sem coordenar o instante do deploy:
--
--   * código velho + função nova → o código velho simplesmente não a chama;
--   * código novo + função ainda ausente → o driver detecta o erro de "função
--     não existe" (PGRST202 / 42883), avisa no log e volta sozinho para o
--     caminho INSERT + 2 SELECTs de antes.
--
-- Ou seja: dá para rodar esta migration antes ou depois do deploy. O que NÃO
-- dá é considerar a corrida fechada antes de ela ter rodado.
-- ---------------------------------------------------------------------------


-- Seção 1: a função -----------------------------------------------------------
--
-- Os nomes das colunas de saída são `reserva_*` e não `id`/`created_at` de
-- propósito: num `returns table`, os nomes de saída viram variáveis dentro do
-- corpo e passariam a sombrear as colunas homônimas de `ai_calls`, exigindo
-- qualificação em todo lugar e transformando qualquer descuido em bug sutil.

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
-- fazer `ai_calls` resolver para outra tabela. `pg_temp` vai por último,
-- nunca primeiro, para que uma tabela temporária não sequestre o nome.
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_criada_em timestamptz;
begin
  -- A trava. Solta sozinha no commit ou no rollback desta transação.
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));

  insert into public.ai_calls (owner_id, task, fingerprint, result)
  values (p_owner_id, p_task, p_fingerprint, '{}'::jsonb)
  returning ai_calls.id, ai_calls.created_at
  into v_id, v_criada_em;

  -- CONTAGEM SIMPLES, SEM COMPARAR `(created_at, id)` — e é a trava acima que
  -- torna isso correto.
  --
  -- O caminho antigo do app compara a tupla `(created_at, id)` porque lá as
  -- reservas não estão serializadas: cada uma precisa descobrir a própria
  -- posição sem saber quantas outras existem. Acontece que essa comparação NÃO
  -- ordena por inserção. `created_at` tem precisão de milissegundo e o `id` é
  -- um UUID ALEATÓRIO (`gen_random_uuid`), então duas reservas no mesmo
  -- milissegundo saem na ordem do sorteio: a que entrou primeiro pode ter o id
  -- maior, a segunda então não a conta, as duas se veem na posição 1 e as duas
  -- passam. Trocar a visibilidade por uma trava não conserta isso — o defeito
  -- está na comparação, não no que cada transação enxerga.
  --
  -- Com a trava, porém, não há o que desempatar. Nenhuma outra reserva DESTE
  -- usuário pode entrar entre o INSERT acima e os SELECTs abaixo, e todas as
  -- anteriores já commitaram. "Quantas linhas existem na janela" já É a
  -- posição desta reserva na fila, com a própria incluída.
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


-- Seção 2: permissões ---------------------------------------------------------
--
-- Mesmo raciocínio dos grants de tabela do esquema: `anon` (visitante sem
-- sessão) não recebe nada, porque nenhuma tela deste produto chama IA sem
-- login. O `revoke ... from public` é o que importa de verdade — o Postgres
-- concede EXECUTE ao pseudo-papel `public` por padrão em toda função nova, e
-- sem este revoke o grant seletivo abaixo não restringiria coisa alguma.

revoke all on function public.reservar_chamada_ia(uuid, text, text, timestamptz, timestamptz) from public;
revoke all on function public.reservar_chamada_ia(uuid, text, text, timestamptz, timestamptz) from anon;

grant execute on function public.reservar_chamada_ia(uuid, text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.reservar_chamada_ia(uuid, text, text, timestamptz, timestamptz) to service_role;


-- Seção 3: verificação --------------------------------------------------------
--
-- Rode isto DEPOIS e confira as três colunas. Esperado:
--   seguranca_ok  = t  (invoker — ver o comentário do topo)
--   anon_executa  = f  (visitante sem sessão não chama)
--   auth_executa  = t  (usuário logado chama)
--
-- Se `seguranca_ok` vier `f`, a função foi criada como `security definer` por
-- engano e PRECISA ser recriada: do jeito que ela recebe `p_owner_id`, definer
-- sem checagem de `auth.uid()` deixa qualquer usuário logado gravar no nome de
-- outro.

select
  p.proname                                                         as funcao,
  not p.prosecdef                                                   as seguranca_ok,
  has_function_privilege('anon',          p.oid, 'execute')         as anon_executa,
  has_function_privilege('authenticated', p.oid, 'execute')         as auth_executa
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'reservar_chamada_ia';
