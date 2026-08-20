import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';
import { AiError, type AiProvider, type AiTask } from './provider';

/**
 * Provedor real, via API da Anthropic.
 *
 * Trocar de provedor significa escrever outro arquivo como este e devolvê-lo
 * em `getAiProvider()`. Nada fora desta pasta importa o SDK — nem componente,
 * nem Server Action, nem página.
 */

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = env.anthropicApiKey();
  if (!apiKey) {
    throw new AiError('configuracao', 'cliente', 'ANTHROPIC_API_KEY não configurada.');
  }
  client = new Anthropic({ apiKey });
  return client;
}

/**
 * Extrai o JSON da resposta.
 *
 * Mesmo instruído a responder só com JSON, o modelo às vezes embrulha em
 * ```json ... ``` ou emenda uma frase antes. Recortar do primeiro `{` até o
 * último `}` cobre os dois casos sem depender de o modelo obedecer.
 */
function extractJson(raw: string): unknown {
  const withoutFence = raw.replace(/```(?:json)?/gi, '').trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new AiError('formato', 'parse', 'Resposta sem objeto JSON reconhecível.');
  }
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    throw new AiError('formato', 'parse', 'JSON inválido na resposta do modelo.');
  }
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

async function callModel(task: AiTask<unknown>, correction?: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: task.prompt }];
  if (correction) {
    messages.push({ role: 'assistant', content: correction.slice(0, 2000) });
    messages.push({
      role: 'user',
      content:
        'Sua resposta anterior não seguiu o formato pedido. Responda de novo com SOMENTE o objeto JSON válido, sem texto fora dele e sem bloco de código.',
    });
  }

  try {
    const message = await getClient().messages.create({
      model: env.anthropicModel(),
      max_tokens: task.maxTokens,
      // Temperatura baixa: aqui o objetivo é fidelidade ao que a pessoa
      // escreveu, não criatividade. Criatividade, neste produto, é o nome
      // bonito de inventar experiência.
      temperature: 0.2,
      system: task.system,
      messages,
    });
    return textOf(message);
  } catch (error) {
    if (error instanceof AiError) throw error;
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) {
      throw new AiError('configuracao', task.name, 'Chave de API recusada.');
    }
    if (status === 429 || status === 529) {
      throw new AiError('limite', task.name, 'Limite de uso atingido.');
    }
    throw new AiError('rede', task.name, (error as Error).message ?? 'Falha na chamada.');
  }
}

export const anthropicProvider: AiProvider = {
  id: 'anthropic',
  mode: 'real',

  async run<T>(task: AiTask<T>): Promise<T> {
    const first = await callModel(task as AiTask<unknown>);

    const parsedFirst = task.schema.safeParse(safeExtract(first));
    if (parsedFirst.success) return parsedFirst.data;

    // Uma segunda tentativa, e só uma: o erro mais comum é o modelo enfeitar a
    // resposta, e mostrar o texto de volta resolve. Insistir além disso só
    // queima tempo do usuário que está esperando com a tela em carregamento.
    const second = await callModel(task as AiTask<unknown>, first);
    const parsedSecond = task.schema.safeParse(safeExtract(second));
    if (parsedSecond.success) return parsedSecond.data;

    throw new AiError('formato', task.name, parsedSecond.error.issues[0]?.message ?? 'Formato inesperado.');
  },
};

/** Extrai sem lançar, para o `safeParse` decidir se vale a segunda tentativa. */
function safeExtract(raw: string): unknown {
  try {
    return extractJson(raw);
  } catch {
    return null;
  }
}
