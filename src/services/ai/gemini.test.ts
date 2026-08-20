import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { z } from 'zod';
import { extractJson } from './json';
import { AiError, type AiTask } from './provider';
import { geminiProvider } from './gemini';

/**
 * O provedor Gemini é o único ponto do sistema que fala com a internet, e o
 * único que sabe o formato da resposta de um modelo. Os dois motivos pelos
 * quais ele precisa de teste:
 *
 *   1. os caminhos de ERRO nunca acontecem em desenvolvimento — ninguém estoura
 *      a cota gratuita testando na mão — e são exatamente os que o usuário vai
 *      encontrar em produção;
 *   2. a chave de API não pode migrar para a URL num refatoramento distraído.
 *      Query string vaza em log de proxy e em Referer; cabeçalho não.
 *
 * `fetch` é substituído por uma função de mentira. Nenhum teste aqui chama a
 * API do Google, gasta cota ou precisa de chave de verdade.
 */

const schema = z.object({ ok: z.boolean() });

function tarefa(): AiTask<{ ok: boolean }> {
  return {
    name: 'teste',
    system: 'sistema',
    prompt: 'pergunta',
    schema,
    maxTokens: 100,
    demo: () => ({ ok: false }),
  };
}

/** Resposta de sucesso do Gemini, na forma real da API. */
function respostaComTexto(text: string, finishReason = 'STOP') {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] }, finishReason }] }),
  } as unknown as Response;
}

function respostaDeErro(status: number, message: string) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { code: status, message } }),
  } as unknown as Response;
}

const fetchOriginal = globalThis.fetch;
let chamadas: { url: string; init: RequestInit }[] = [];

/** Instala um fetch de mentira que devolve as respostas na ordem dada. */
function mockFetch(...respostas: Response[]) {
  let indice = 0;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    chamadas.push({ url: String(url), init });
    const resposta = respostas[Math.min(indice, respostas.length - 1)];
    indice += 1;
    return resposta;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  chamadas = [];
  process.env.GEMINI_API_KEY = 'chave-de-teste';
  process.env.AI_PROVIDER = 'gemini';
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  delete process.env.GEMINI_API_KEY;
  delete process.env.AI_PROVIDER;
});

describe('geminiProvider', () => {
  it('devolve o objeto validado quando o modelo responde JSON puro', async () => {
    mockFetch(respostaComTexto('{"ok": true}'));
    const resultado = await geminiProvider.run(tarefa());
    assert.deepEqual(resultado, { ok: true });
    assert.equal(chamadas.length, 1, 'uma resposta válida não pode custar duas chamadas');
  });

  it('manda a chave no cabeçalho e nunca na URL', async () => {
    mockFetch(respostaComTexto('{"ok": true}'));
    await geminiProvider.run(tarefa());

    const { url, init } = chamadas[0];
    assert.ok(!url.includes('chave-de-teste'), 'a chave apareceu na URL');
    assert.ok(!url.includes('key='), 'a chave foi passada como query string');
    assert.equal(
      (init.headers as Record<string, string>)['x-goog-api-key'],
      'chave-de-teste'
    );
  });

  it('não manda o corpo da resposta anterior quando a primeira já serve', async () => {
    mockFetch(respostaComTexto('{"ok": true}'));
    await geminiProvider.run(tarefa());
    const corpo = JSON.parse(String(chamadas[0].init.body));
    assert.equal(corpo.contents.length, 1);
    assert.equal(corpo.generationConfig.responseMimeType, 'application/json');
  });

  it('tenta uma segunda vez quando a primeira resposta não passa no schema', async () => {
    mockFetch(respostaComTexto('desculpe, não entendi'), respostaComTexto('{"ok": true}'));
    const resultado = await geminiProvider.run(tarefa());
    assert.deepEqual(resultado, { ok: true });
    assert.equal(chamadas.length, 2);

    // A segunda chamada mostra a resposta ruim de volta ao modelo e pede o
    // formato certo — é o que faz a retentativa valer a pena em vez de ser
    // uma repetição idêntica.
    const corpo = JSON.parse(String(chamadas[1].init.body));
    assert.equal(corpo.contents.length, 3);
    assert.equal(corpo.contents[1].role, 'model');
  });

  it('desiste depois da segunda tentativa em vez de insistir', async () => {
    mockFetch(respostaComTexto('nada'), respostaComTexto('nada de novo'));
    await assert.rejects(
      () => geminiProvider.run(tarefa()),
      (error: unknown) => error instanceof AiError && error.kind === 'formato'
    );
    assert.equal(chamadas.length, 2, 'insistir além de duas queima cota gratuita');
  });

  it('traduz 429 em erro de limite, não em erro genérico', async () => {
    mockFetch(respostaDeErro(429, 'Resource has been exhausted'));
    await assert.rejects(
      () => geminiProvider.run(tarefa()),
      (error: unknown) => {
        assert.ok(error instanceof AiError);
        assert.equal(error.kind, 'limite');
        // A mensagem que o usuário lê não pode ser o texto cru do Google.
        assert.match(error.userMessage, /limite de uso/i);
        return true;
      }
    );
  });

  it('traduz chave inválida em erro de configuração', async () => {
    mockFetch(respostaDeErro(400, 'API key not valid. Please pass a valid API key.'));
    await assert.rejects(
      () => geminiProvider.run(tarefa()),
      (error: unknown) => error instanceof AiError && error.kind === 'configuracao'
    );
  });

  it('trata resposta cortada por limite de tokens como erro, não como sucesso', async () => {
    mockFetch(respostaComTexto('{"ok": tr', 'MAX_TOKENS'));
    await assert.rejects(
      () => geminiProvider.run(tarefa()),
      (error: unknown) => error instanceof AiError && error.kind === 'formato'
    );
  });

  it('reconhece bloqueio dos filtros de conteúdo', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }),
    })) as unknown as typeof fetch;

    await assert.rejects(
      () => geminiProvider.run(tarefa()),
      (error: unknown) => error instanceof AiError && error.kind === 'bloqueio'
    );
  });

  it('falha com erro de configuração quando não há chave', async () => {
    delete process.env.GEMINI_API_KEY;
    mockFetch(respostaComTexto('{"ok": true}'));
    await assert.rejects(
      () => geminiProvider.run(tarefa()),
      (error: unknown) => error instanceof AiError && error.kind === 'configuracao'
    );
    assert.equal(chamadas.length, 0, 'sem chave, nem chega a sair requisição');
  });
});

describe('extractJson', () => {
  it('lê JSON puro', () => {
    assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  });

  it('lê JSON embrulhado em bloco de código', () => {
    assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  });

  it('lê JSON com frase antes e depois', () => {
    assert.deepEqual(extractJson('Claro! Aqui está:\n{"a":1}\nEspero ter ajudado.'), { a: 1 });
  });

  it('devolve null em vez de lançar quando não há objeto', () => {
    assert.equal(extractJson('sem objeto nenhum'), null);
    assert.equal(extractJson('{quebrado'), null);
  });
});
