import { createHash } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Identidade de uma pergunta feita à IA, e o corte do que entra nela.
 *
 * MORA SEPARADO DE `src/server/ai-budget.ts` de propósito: aquele arquivo toca
 * o banco, e este é aritmética pura sobre texto. A separação é o que permite
 * cobrir por teste a parte onde os erros são silenciosos — um hash instável faz
 * o cache nunca acertar, e a única evidência disso é uma conta de API mais alta
 * no fim do mês.
 */

/** Quantos caracteres de entrada uma tarefa aceita antes do corte. */
export const MAX_INPUT_CHARS = 20_000;

/** Corta texto de entrada antes de ele virar prompt — e antes de virar custo. */
export function capInput(value: unknown, max = MAX_INPUT_CHARS): string {
  if (typeof value !== 'string') return '';
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Serializa de forma estável.
 *
 * `JSON.stringify` comum preserva a ordem em que as chaves foram inseridas no
 * objeto — dois objetos com o mesmo conteúdo, montados por caminhos diferentes,
 * gerariam hashes diferentes e o cache nunca acertaria. Ordenar as chaves
 * resolve isso de uma vez.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);

  return `{${entries.join(',')}}`;
}

/**
 * A impressão digital da pergunta.
 *
 * Inclui provedor e modelo: trocar de modelo TEM que invalidar o cache, senão a
 * pessoa liga uma IA melhor e continua vendo a resposta antiga sem entender por
 * quê.
 *
 * É um hash, e não o texto: o registro de uso não precisa de uma segunda cópia
 * do currículo de ninguém espalhada pelo banco.
 */
export function fingerprint(task: string, input: unknown): string {
  const provider = env.aiProvider();
  const model =
    provider === 'gemini'
      ? env.geminiModel()
      : provider === 'anthropic'
        ? env.anthropicModel()
        : 'demo';

  return createHash('sha256')
    .update(`${provider}|${model}|${task}|${stableStringify(input)}`)
    .digest('hex');
}
