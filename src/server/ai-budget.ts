import 'server-only';

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
 */

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
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

  // 2. Limites. O da hora primeiro: é o que segura um abuso em andamento, e
  // falhar nele evita até a consulta do limite diário.
  const hourly = env.aiHourlyLimit();
  const usedInHour = await repository.countAiCalls(userId, minutesAgo(60));
  if (usedInHour >= hourly) {
    throw new AiError(
      'cota',
      task,
      `Limite por hora atingido (${usedInHour}/${hourly}).`,
      `Você fez ${usedInHour} análises na última hora, que é o limite. Aguarde alguns minutos e tente de novo — seus dados continuam salvos.`
    );
  }

  const daily = env.aiDailyLimit();
  const usedInDay = await repository.countAiCalls(userId, minutesAgo(24 * 60));
  if (usedInDay >= daily) {
    throw new AiError(
      'cota',
      task,
      `Limite diário atingido (${usedInDay}/${daily}).`,
      `Você fez ${usedInDay} análises nas últimas 24 horas, que é o limite diário. O contador libera aos poucos ao longo do dia — seus dados continuam salvos.`
    );
  }

  // 3. A chamada.
  let envelope: AiEnvelope<T>;
  try {
    envelope = await run();
  } catch (error) {
    // FALHA TAMBÉM CONSOME COTA, e ignorar isso era um buraco de custo real:
    // uma resposta que não passa no schema já gastou de uma a quatro chamadas
    // pagas ao provedor. Sem registrar, bastava mandar entrada que sempre
    // falha para chamar a IA sem limite nenhum.
    //
    // As exceções são as falhas em que NENHUMA requisição saiu: chave ausente
    // ou recusada (configuracao) e o próprio limite (cota). Cobrar por elas
    // puniria a pessoa por um problema de configuração do ambiente.
    if (!(error instanceof AiError) || !SEM_CUSTO.includes(error.kind)) {
      await registrarFalha(repository, userId, task, key);
    }
    throw error;
  }

  // O registro de sucesso também é o que alimenta o cache da próxima vez.
  //
  // A gravação não pode derrubar um resultado que já está pronto na mão do
  // usuário: se o banco recusar, o log recebe e a resposta segue.
  try {
    await repository.recordAiCall(userId, { task, fingerprint: key, result: envelope.data });
  } catch (error) {
    console.error('[ai-budget] falha ao registrar chamada', error);
  }

  return envelope;
}

/** Falhas em que nenhuma requisição chegou a sair — não custaram nada. */
const SEM_CUSTO: readonly string[] = ['configuracao', 'cota'];

/**
 * Registra uma tentativa que falhou, para ela contar no limite.
 *
 * A IMPRESSÃO DIGITAL É PROPOSITALMENTE IMPOSSÍVEL DE ENCONTRAR: o prefixo
 * "falha:" e o instante garantem que nenhuma consulta de cache — que procura
 * por um sha256 de 64 caracteres — vá casar com esta linha. Sem esse cuidado,
 * a tentativa fracassada entraria no cache e passaria a ser servida como se
 * fosse resultado, para toda repetição da mesma pergunta.
 *
 * O RESULTADO É UM OBJETO VAZIO, e não `null`: a coluna `result` de
 * `public.ai_calls` é `jsonb not null`, e gravar nulo violaria a restrição. O
 * erro cairia no `catch` abaixo, o app seguiria funcionando, e a falha nunca
 * seria contabilizada no limite — em produção, em silêncio, reabrindo o
 * buraco de custo que esta função existe para fechar. O driver local aceita
 * qualquer um dos dois; o de produção, não.
 */
async function registrarFalha(
  repository: Awaited<ReturnType<typeof getRepository>>,
  userId: string,
  task: string,
  key: string
): Promise<void> {
  try {
    await repository.recordAiCall(userId, {
      task: `falha:${task}`,
      fingerprint: `falha:${key}:${Date.now()}`,
      result: {},
    });
  } catch (error) {
    console.error('[ai-budget] falha ao registrar tentativa malsucedida', error);
  }
}
