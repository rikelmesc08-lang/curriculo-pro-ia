import 'server-only';

import { randomUUID } from 'node:crypto';
import { getRepository } from '@/lib/db';
import { env } from '@/lib/env';
import { AiError, aiModeIsDemo } from '@/services/ai';
import { fingerprint } from '@/services/ai/fingerprint';
import type { AiEnvelope } from '@/types/ai';

export { capInput, MAX_INPUT_CHARS } from '@/services/ai/fingerprint';

/**
 * Controle de custo das chamadas de IA.
 *
 * O PROBLEMA QUE ISTO RESOLVE: uma Server Action de IA exige sessão, e só. Com
 * um login e um laço de repetição, qualquer pessoa transforma a chave de API do
 * projeto numa conta aberta. Não é hipótese remota — é o primeiro roteiro de
 * quem encontra um endpoint de IA sem limite.
 *
 * Três camadas, em ordem de custo crescente:
 *
 *   1. CACHE — mesma pergunta, mesma resposta, sem chamar a IA. É o que mais
 *      economiza no uso real: a pessoa clica, lê, muda de aba, volta e clica de
 *      novo. Servir do cache NÃO conta contra o limite: não chegou a ser
 *      requisição.
 *   2. LIMITE POR JANELA — teto por hora (contém o pico) e por dia (contém o
 *      acumulado), por usuário, contados no banco.
 *   3. A CHAMADA — só chega aqui o que passou pelas duas anteriores.
 *
 * O modo demonstração pula tudo: não custa nada, não chama ninguém, e limitar
 * uma tela de demonstração só atrapalharia quem está conhecendo o produto.
 *
 * RESERVA ANTES DE EXECUTAR, E A RESERVA É UMA SENHA DE FILA.
 *
 * Até aqui a contagem só GRAVAVA depois de `run()` terminar, e `run()` é uma
 * chamada de rede que leva segundos. Entre "ler quantas chamadas existem" e
 * "gravar esta chamada" havia uma janela de vários segundos: um usuário
 * autenticado disparando N Server Actions verdadeiramente em paralelo (um
 * `Promise.all` de dezenas de fetches, cada um com entrada diferente para não
 * cair no cache) fazia todas lerem o mesmo `usedInHour` — porque nenhuma tinha
 * gravado ainda — e todas passarem. Os tetos de 15/hora e 40/dia eram furados
 * proporcionalmente ao paralelismo, e o prejuízo é custo real de API.
 *
 * A primeira versão desta correção gravava a linha da chamada — a RESERVA —
 * ANTES de checar o limite e ANTES de chamar `run()`, mas contava a JANELA
 * INTEIRA (toda chamada desde `since`, reserva incluída). Isso fecha a corrida
 * de outro jeito quebrado: numa rajada de N reservas verdadeiramente
 * paralelas, as N gravações entram antes de qualquer contagem rodar (no driver
 * local, a fila única do arquivo serializa as N escritas antes das N
 * leituras) — cada requisição então conta N, todas veem `N > limite`, e TODAS
 * são recusadas. Com teto 3 e 10 chamadas paralelas, o resultado virava 0
 * aprovadas em vez de 3: TOCTOU trocado por indisponibilidade.
 *
 * A correção de verdade é a reserva virar uma SENHA DE FILA: em vez de contar
 * a janela inteira, `countAiCalls` recebe `upTo` — a posição `(createdAt, id)`
 * da PRÓPRIA reserva — e conta só quem está até ali. N reservas concorrentes
 * recebem N posições distintas (1..N, pela ordem em que efetivamente entraram
 * na fila de escrita), e cada uma decide sozinha, pela própria posição, se
 * está dentro do limite — sem que a contagem de uma dependa de quantas OUTRAS
 * já viram a delas. É exatamente essa independência que deixa passar as
 * `limite` primeiras em vez de recusar as N ou aprovar as N.
 *
 *   - Driver `local`: fecha a corrida por completo. O arquivo é acessado por
 *     uma fila que serializa TODA leitura e escrita num processo só
 *     (`src/lib/db/local/store.ts`); a posição de cada reserva na fila
 *     `(createdAt, id)` é estável desde o instante em que ela é gravada, e
 *     como a leitura da contagem roda depois, na mesma fila, ela sempre
 *     enxerga a posição definitiva — nunca uma posição que ainda vai mudar.
 *   - Driver `supabase`: reduz a janela ao tamanho de um INSERT (a reserva) e
 *     dois SELECTs (as duas contagens), mas não a fecha por completo. A linha
 *     de uma transação concorrente que ainda não deu commit pode não estar
 *     visível para o SELECT de outra requisição — então um punhado de
 *     chamadas ainda pode furar o teto, não mais um número proporcional ao
 *     paralelismo total. Fechar por completo exigiria uma função de banco que
 *     conte e grave num único statement (o que precisaria de uma migration —
 *     ver `docs/migrations`).
 *
 * Se a reserva não vira uma chamada de verdade — limite estourado, ou erro que
 * não chegou a sair (`configuracao`/`cota`) —, ela é desfeita
 * (`repository.deleteAiCall`). Se vira uma chamada de verdade, ela é
 * substituída pelo registro final: sucesso grava o resultado de novo (para
 * alimentar o cache, ver função `run()` abaixo); falha real apenas relabela a
 * reserva como falha, do jeito que `registrarFalha` já fazia antes desta
 * mudança.
 */

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** Fingerprint que uma reserva usa antes de saber se virou sucesso ou falha.
 *
 * Prefixo "reserva:" pelo mesmo motivo do "falha:" que já existia: garantir
 * que nenhuma consulta de cache — que procura por um sha256 de 64 caracteres —
 * vá casar com esta linha enquanto ela ainda não tem resultado de verdade.
 */
function reservaFingerprint(key: string): string {
  return `reserva:${key}:${Date.now()}:${randomUUID()}`;
}

/**
 * Roda a tarefa passando pelas três camadas.
 *
 * `input` é o que identifica a pergunta — currículo, vaga, empresa, cargo. Tem
 * que conter TUDO que muda a resposta: um campo esquecido aqui faz o cache
 * devolver a resposta de outra pergunta, que é pior do que não ter cache.
 */
export async function runWithBudget<T>(
  userId: string,
  task: string,
  input: unknown,
  run: () => Promise<AiEnvelope<T>>
): Promise<AiEnvelope<T>> {
  if (aiModeIsDemo()) return run();

  const repository = await getRepository();
  const key = fingerprint(task, input);

  // 1. Cache.
  const cacheMinutes = env.aiCacheMinutes();
  if (cacheMinutes > 0) {
    const hit = await repository.findAiCall(userId, key, minutesAgo(cacheMinutes));
    if (hit) {
      return {
        mode: 'real',
        data: hit.result as T,
        cached: true,
      };
    }
  }

  // 2. Reserva — GRAVA ANTES DE CHECAR O LIMITE E ANTES DE CHAMAR A IA. É o
  // que fecha (driver local) ou reduz ao mínimo (driver Supabase) a janela
  // descrita no comentário do topo do arquivo. A partir daqui, esta chamada já
  // conta na contagem de qualquer requisição concorrente — inclusive na
  // própria, computada logo abaixo.
  //
  // SEM try/catch: se a reserva falhar, a chamada de IA não roda. É proposital
  // — FAIL-CLOSED, MUDANÇA DE COMPORTAMENTO VISÍVEL. Antes desta correção, uma
  // falha ao GRAVAR (só acontecia depois da IA já ter respondido) era engolida
  // e o usuário recebia o resultado do mesmo jeito, sem saber que o registro
  // de uso não foi salvo. Agora, se o banco não aceitar a reserva, a análise
  // nem começa: continuar sem conseguir gravar a reserva é exatamente andar
  // sem o controle de cota que esta função existe para impor. Uma
  // instabilidade passageira do banco passa a bloquear a análise em vez de
  // rodá-la sem contar — a troca certa para uma camada de limite de custo.
  const reservation = await repository.recordAiCall(userId, {
    task: `reserva:${task}`,
    fingerprint: reservaFingerprint(key),
    result: {},
  });
  const reservationId = reservation.id;

  /** Desfaz a reserva. Best-effort: nunca deixa um erro daqui mascarar o motivo original. */
  async function liberarReserva(): Promise<void> {
    try {
      await repository.deleteAiCall(userId, reservationId);
    } catch (error) {
      console.error('[ai-budget] falha ao liberar reserva', error);
    }
  }

  // 3. Limites. O da hora primeiro: é o que segura um abuso em andamento, e
  // falhar nele evita até a consulta do limite diário. `usedInHour` e
  // `usedInDay` não são "quantas chamadas existem na janela" — são a POSIÇÃO
  // desta reserva na fila da janela, porque `reservation` é passada como
  // `upTo` (ver comentário de topo do arquivo: é isto que evita que uma
  // rajada paralela recuse todo mundo). Como toda reserva é contada a partir
  // de 1, `usedInHour - 1` nas mensagens abaixo continua sendo exatamente
  // "quantas você já tinha feito antes desta" — a mesma semântica de antes
  // desta correção, só que agora calculada por posição, não por contagem
  // total.
  const hourly = env.aiHourlyLimit();
  const usedInHour = await repository.countAiCalls(userId, minutesAgo(60), reservation);
  if (usedInHour > hourly) {
    await liberarReserva();
    throw new AiError(
      'cota',
      task,
      `Limite por hora atingido (${usedInHour - 1}/${hourly}).`,
      `Você fez ${usedInHour - 1} análises na última hora, que é o limite. Aguarde alguns minutos e tente de novo — seus dados continuam salvos.`
    );
  }

  const daily = env.aiDailyLimit();
  const usedInDay = await repository.countAiCalls(userId, minutesAgo(24 * 60), reservation);
  if (usedInDay > daily) {
    await liberarReserva();
    throw new AiError(
      'cota',
      task,
      `Limite diário atingido (${usedInDay - 1}/${daily}).`,
      `Você fez ${usedInDay - 1} análises nas últimas 24 horas, que é o limite diário. O contador libera aos poucos ao longo do dia — seus dados continuam salvos.`
    );
  }

  // 4. A chamada.
  let envelope: AiEnvelope<T>;
  try {
    envelope = await run();
  } catch (error) {
    // FALHA TAMBÉM CONSOME COTA, e ignorar isso era um buraco de custo real:
    // uma resposta que não passa no schema já gastou de uma a quatro chamadas
    // pagas ao provedor. A reserva acima já cobre isso — não precisa gravar
    // nada novo, só deixá-la como está.
    //
    // A exceção é a falha em que NENHUMA requisição saiu: chave ausente ou
    // recusada (configuracao) e o próprio limite (cota, lançado por dentro da
    // tarefa). Cobrar por elas puniria a pessoa por um problema de
    // configuração do ambiente — por isso a reserva é desfeita, não mantida.
    if (!(error instanceof AiError) || !SEM_CUSTO.includes(error.kind)) {
      await relabelarComoFalha(repository, userId, reservationId, task, key);
    } else {
      await liberarReserva();
    }
    throw error;
  }

  // Sucesso: a reserva vira o registro de verdade, com o resultado real —
  // que também é o que alimenta o cache da próxima vez.
  //
  // ORDEM DE PROPÓSITO: grava o registro final ANTES de apagar a reserva, não
  // depois. Se a ordem fosse invertida e o INSERT falhasse depois do DELETE
  // já ter rodado, esta chamada bem-sucedida sumiria da contagem por
  // completo — a mesma falha silenciosa de custo que esta correção existe
  // para fechar. Nesta ordem, o pior caso de uma falha no DELETE é a reserva
  // sobrar ao lado do registro final, contando 1 a mais só nesta chamada —
  // errar para o lado estrito, nunca para o lado de deixar de contar.
  //
  // A troca também não pode derrubar um resultado que já está pronto na mão
  // do usuário: se o banco recusar o INSERT, o log recebe e a resposta segue
  // (a reserva fica para trás como está, contando normalmente para o limite).
  try {
    await repository.recordAiCall(userId, { task, fingerprint: key, result: envelope.data });
    await repository.deleteAiCall(userId, reservationId);
  } catch (error) {
    console.error('[ai-budget] falha ao registrar chamada', error);
  }

  return envelope;
}

/** Falhas em que nenhuma requisição chegou a sair — não custaram nada. */
const SEM_CUSTO: readonly string[] = ['configuracao', 'cota'];

/**
 * Transforma a reserva de uma tentativa que falhou de verdade em registro de
 * falha, para ela continuar contando no limite — exatamente como
 * `registrarFalha` fazia antes desta correção, só que agora a linha já
 * existia (como reserva) antes de a IA responder.
 *
 * A IMPRESSÃO DIGITAL É PROPOSITALMENTE IMPOSSÍVEL DE ENCONTRAR: o prefixo
 * "falha:" e o instante garantem que nenhuma consulta de cache — que procura
 * por um sha256 de 64 caracteres — vá casar com esta linha. Sem esse cuidado,
 * a tentativa fracassada entraria no cache e passaria a ser servida como se
 * fosse resultado, para toda repetição da mesma pergunta.
 *
 * O RESULTADO É UM OBJETO VAZIO, e não `null`: a coluna `result` de
 * `public.ai_calls` é `jsonb not null`, e gravar nulo violaria a restrição.
 *
 * ORDEM DE PROPÓSITO, igual ao caminho de sucesso: grava o registro de falha
 * ANTES de apagar a reserva. Se o INSERT falhasse depois de um DELETE já
 * aplicado, esta tentativa fracassada sumiria da contagem — o mesmo buraco de
 * custo que motivou o comentário original de `registrarFalha` ("sem
 * registrar, bastava mandar entrada que sempre falha para chamar a IA sem
 * limite nenhum"). Nesta ordem, o pior caso de um DELETE que falhe é a reserva
 * sobrar ao lado do registro de falha, contando 1 a mais — estrito, não
 * silencioso.
 *
 * SE A TROCA FALHAR (insert ou delete), A RESERVA FICA COMO ESTÁ — ela já
 * conta no limite do mesmo jeito, só com o rótulo "reserva:" em vez de
 * "falha:". O erro original de `run()` continua sendo o que chega ao chamador;
 * este best-effort nunca o mascara.
 */
async function relabelarComoFalha(
  repository: Awaited<ReturnType<typeof getRepository>>,
  userId: string,
  reservationId: string,
  task: string,
  key: string
): Promise<void> {
  try {
    await repository.recordAiCall(userId, {
      task: `falha:${task}`,
      fingerprint: `falha:${key}:${Date.now()}`,
      result: {},
    });
    await repository.deleteAiCall(userId, reservationId);
  } catch (error) {
    console.error('[ai-budget] falha ao registrar tentativa malsucedida', error);
  }
}
