import 'server-only';

import { env } from '@/lib/env';
import { extractJson } from './json';
import { AiError, type AiProvider, type AiTask } from './provider';

/**
 * Provedor opcional, via API da Anthropic.
 *
 * NÃO É O PADRÃO e não é exigido em lugar nenhum: o padrão é `gemini`, que tem
 * camada gratuita. Este arquivo continua no projeto por dois motivos — quem já
 * tem crédito na Anthropic pode ligar com `AI_PROVIDER=anthropic`, e ele é a
 * prova de que a abstração de provedor funciona de verdade, com dois provedores
 * reais implementados contra o mesmo contrato.
 *
 * `fetch` em vez do SDK oficial, pelo mesmo motivo do Gemini: a chamada é um
 * POST com JSON, e assim o projeto não carrega um pacote da Anthropic para
 * quem nunca vai usá-la.
 */

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const TIMEOUT_MS = 45_000;

interface AnthropicResponse {
  content?: { type?: string; text?: string }[];
  stop_reason?: string;
  error?: { type?: string; message?: string };
}

function apiKey(): string {
  const key = env.anthropicApiKey();
  if (!key) {
    throw new AiError('configuracao', 'cliente', 'ANTHROPIC_API_KEY não configurada.');
  }
  return key;
}

function errorFromStatus(status: number, body: AnthropicResponse, task: string): AiError {
  const message = body.error?.message ?? `HTTP ${status}`;
  if (status === 401 || status === 403) {
    return new AiError('configuracao', task, 'Chave de API recusada.');
  }
  if (status === 429 || status === 529) {
    return new AiError('limite', task, 'Limite de uso atingido.');
  }
  if (status === 400) {
    return new AiError('formato', task, `Requisição recusada: ${message}`);
  }
  return new AiError('rede', task, message);
}

async function callModel(task: AiTask<unknown>, correction?: string): Promise<string> {
  /**
   * RECUSA EM VOZ ALTA, e nunca ignora o anexo.
   *
   * Este provedor monta `content` como texto puro. Deixar passar uma tarefa com
   * arquivo mandaria ao modelo "extraia os dados do PDF acima" sem PDF nenhum,
   * e ele responderia inventando um currículo inteiro — dado falso com cara de
   * dado extraído, que é exatamente o que este produto promete não fazer.
   */
  if (task.attachment) {
    throw new AiError(
      'configuracao',
      task.name,
      'O provedor Anthropic não está montando anexos neste projeto.',
      'A importação de currículo em arquivo só funciona com o Gemini configurado. Você ainda pode colar o texto do currículo.'
    );
  }

  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: task.prompt },
  ];

  if (correction) {
    messages.push({ role: 'assistant', content: correction.slice(0, 2000) });
    messages.push({
      role: 'user',
      content:
        'Sua resposta anterior não seguiu o formato pedido. Responda de novo com SOMENTE o objeto JSON válido, sem texto fora dele e sem bloco de código.',
    });
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey(),
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify({
        model: env.anthropicModel(),
        max_tokens: task.maxTokens,
        // Temperatura baixa: fidelidade ao que a pessoa escreveu, não
        // criatividade. Criatividade aqui é o nome bonito de inventar
        // experiência.
        temperature: 0.2,
        system: task.system,
        messages,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof AiError) throw error;
    const aborted = (error as Error).name === 'TimeoutError' || (error as Error).name === 'AbortError';
    throw new AiError(
      'rede',
      task.name,
      aborted ? `Sem resposta da Anthropic em ${TIMEOUT_MS / 1000}s.` : ((error as Error).message ?? 'Falha na chamada.')
    );
  }

  let body: AnthropicResponse;
  try {
    body = (await response.json()) as AnthropicResponse;
  } catch {
    throw new AiError('formato', task.name, `Resposta ilegível (HTTP ${response.status}).`);
  }

  if (!response.ok) throw errorFromStatus(response.status, body, task.name);

  if (body.stop_reason === 'max_tokens') {
    throw new AiError('formato', task.name, 'Resposta cortada por limite de tokens.');
  }

  return (body.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n')
    .trim();
}

export const anthropicProvider: AiProvider = {
  id: 'anthropic',
  mode: 'real',

  async run<T>(task: AiTask<T>): Promise<T> {
    const first = await callModel(task as AiTask<unknown>);

    const parsedFirst = task.schema.safeParse(extractJson(first));
    if (parsedFirst.success) return parsedFirst.data;

    // Uma segunda tentativa, e só uma: o erro mais comum é o modelo enfeitar a
    // resposta, e mostrar o texto de volta resolve. Insistir além disso só
    // queima tempo do usuário que está esperando com a tela em carregamento.
    const second = await callModel(task as AiTask<unknown>, first);
    const parsedSecond = task.schema.safeParse(extractJson(second));
    if (parsedSecond.success) return parsedSecond.data;

    throw new AiError(
      'formato',
      task.name,
      parsedSecond.error.issues[0]?.message ?? 'Formato inesperado.'
    );
  },
};
