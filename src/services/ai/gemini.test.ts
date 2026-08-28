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

/**
 * Um 429 com os `details` que o Google manda de verdade.
 *
 * O corpo abaixo foi COPIADO de uma resposta real, capturada em 28/08/2026
 * contra `gemini-3.6-flash`: o nível gratuito permite 20 chamadas POR DIA no
 * projeto inteiro, e foi isso que derrubou a importação de currículo em
 * produção. Inventar o formato aqui testaria a nossa imaginação; copiá-lo testa
 * o que chega.
 */
function resposta429ComCota(quotaId: string, quotaValue: string) {
  return {
    ok: false,
    status: 429,
    json: async () => ({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: 'You exceeded your current quota, please check your plan and billing details.',
        details: [
          { '@type': 'type.googleapis.com/google.rpc.Help', links: [] },
          {
            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
            violations: [{ quotaId, quotaValue }],
          },
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '48s' },
        ],
      },
    }),
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
  // Os testes de thinkingConfig definem um modelo por caso. Sem esta limpeza, o
  // nome vazaria para os testes seguintes — e o conjunto de "modelos que
  // recusaram" é por NOME, então um vazamento faria um teste desligar a
  // otimização de outro, com falha que só aparece na ordem de execução.
  delete process.env.GEMINI_MODEL;
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

/**
 * Controle de raciocínio.
 *
 * Cada teste usa um `GEMINI_MODEL` PRÓPRIO porque a memória de "este modelo
 * recusou o campo" é por modelo e vive enquanto o processo viver: dois testes
 * no mesmo nome de modelo se contaminariam pela ordem de execução, e o teste do
 * recuo apagaria o do caminho feliz.
 */
/**
 * O QUE A MENSAGEM DE ERRO MANDA A PESSOA FAZER.
 *
 * Estas mensagens são a única coisa que sobra quando a IA falha, e as duas que
 * existiam davam conselho impossível de seguir: mandavam quem enviou um PDF
 * "reduzir o texto colado" (não havia texto colado), e prometiam "alguns
 * minutos" para uma cota que é DIÁRIA. Conselho errado é pior que nenhum: a
 * pessoa fica clicando contra uma parede em vez de usar a saída que funciona.
 */
describe('mensagens de erro dizem a verdade sobre a causa', () => {
  async function erroDe(resposta: Response, task = tarefa()): Promise<AiError> {
    mockFetch(resposta);
    try {
      await geminiProvider.run(task);
    } catch (erro) {
      return erro as AiError;
    }
    throw new Error('a chamada devia ter falhado');
  }

  it('cota DIÁRIA não promete que libera em minutos', async () => {
    const erro = await erroDe(
      resposta429ComCota('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '20')
    );

    assert.equal(erro.kind, 'limite');
    assert.match(erro.userMessage, /amanhã/i, 'precisa dizer quando volta de verdade');
    assert.match(erro.userMessage, /20/, 'dizer o número torna o limite compreensível');
    assert.doesNotMatch(
      erro.userMessage,
      /alguns minutos/i,
      'com cota diária, "alguns minutos" deixa a pessoa clicando por horas'
    );
  });

  it('cota por minuto continua pedindo para esperar um instante', async () => {
    const erro = await erroDe(
      resposta429ComCota('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '10')
    );

    assert.equal(erro.kind, 'limite');
    assert.match(erro.userMessage, /instante|espere/i);
    assert.doesNotMatch(erro.userMessage, /amanhã/i, 'esta libera em segundos, não amanhã');
  });

  it('429 sem detalhes não inventa prazo nenhum', async () => {
    const erro = await erroDe(respostaDeErro(429, 'Resource has been exhausted'));

    assert.equal(erro.kind, 'limite');
    assert.doesNotMatch(
      erro.userMessage,
      /alguns minutos|amanhã/i,
      'sem saber qual cota estourou, prometer prazo é chute'
    );
  });

  it('tempo esgotado COM arquivo manda colar o texto, não reduzir texto que não existe', async () => {
    globalThis.fetch = (async () => {
      const erro = new Error('timeout');
      erro.name = 'TimeoutError';
      throw erro;
    }) as unknown as typeof fetch;

    const comPdf: AiTask<{ ok: boolean }> = {
      ...tarefa(),
      attachment: { mimeType: 'application/pdf', dataBase64: 'ZmFrZQ==' },
    };

    let erro: AiError | null = null;
    try {
      await geminiProvider.run(comPdf);
    } catch (e) {
      erro = e as AiError;
    }

    assert.ok(erro);
    assert.match(erro.userMessage, /colar o texto/i, 'é a saída medida como 10x mais rápida');
    assert.doesNotMatch(
      erro.userMessage,
      /reduza o tamanho do texto colado/i,
      'quem mandou PDF não colou texto nenhum'
    );
  });

  it('tempo esgotado SEM arquivo continua falando do texto colado', async () => {
    globalThis.fetch = (async () => {
      const erro = new Error('timeout');
      erro.name = 'TimeoutError';
      throw erro;
    }) as unknown as typeof fetch;

    let erro: AiError | null = null;
    try {
      await geminiProvider.run(tarefa());
    } catch (e) {
      erro = e as AiError;
    }

    assert.ok(erro);
    assert.match(erro.userMessage, /texto colado/i);
  });
});

describe('thinkingConfig', () => {
  function corpoDe(indice: number): Record<string, unknown> {
    return JSON.parse(String(chamadas[indice].init.body)) as Record<string, unknown>;
  }
  function generationConfigDe(indice: number): Record<string, unknown> {
    return corpoDe(indice).generationConfig as Record<string, unknown>;
  }

  it('tarefa comum não manda thinkingConfig — o padrão é o modelo pensar', async () => {
    process.env.GEMINI_MODEL = 'modelo-comum';
    mockFetch(respostaComTexto('{"ok": true}'));
    await geminiProvider.run(tarefa());

    assert.equal(
      generationConfigDe(0).thinkingConfig,
      undefined,
      'sem pedido explícito, nada pode ser mexido no raciocínio'
    );
  });

  it("tarefa de transcrição manda thinkingLevel 'low'", async () => {
    process.env.GEMINI_MODEL = 'modelo-que-aceita';
    mockFetch(respostaComTexto('{"ok": true}'));
    await geminiProvider.run({ ...tarefa(), reasoning: 'minimal' });

    assert.deepEqual(generationConfigDe(0).thinkingConfig, { thinkingLevel: 'low' });
  });

  it('modelo que recusa o campo com 400 recebe a mesma tarefa sem ele, e ela funciona', async () => {
    process.env.GEMINI_MODEL = 'modelo-antigo';
    // Primeira resposta: 400 sem citar raciocínio nenhum — foi exatamente a
    // recusa medida contra a API real ("Request contains an invalid argument").
    mockFetch(
      respostaDeErro(400, 'Request contains an invalid argument.'),
      respostaComTexto('{"ok": true}')
    );

    const resultado = await geminiProvider.run({ ...tarefa(), reasoning: 'minimal' });

    // O que importa: a pessoa recebeu o resultado. Uma preferência de
    // desempenho não pode derrubar a funcionalidade.
    assert.deepEqual(resultado, { ok: true });
    assert.equal(chamadas.length, 2, 'devia ter tentado de novo, sem o campo');
    assert.deepEqual(generationConfigDe(0).thinkingConfig, { thinkingLevel: 'low' });
    assert.equal(generationConfigDe(1).thinkingConfig, undefined, 'a repetição ainda mandou o campo');
  });

  it('depois de recusado, o mesmo modelo não tenta de novo na chamada seguinte', async () => {
    process.env.GEMINI_MODEL = 'modelo-teimoso';
    mockFetch(respostaDeErro(400, 'Request contains an invalid argument.'), respostaComTexto('{"ok": true}'));
    await geminiProvider.run({ ...tarefa(), reasoning: 'minimal' });

    chamadas = [];
    mockFetch(respostaComTexto('{"ok": true}'));
    await geminiProvider.run({ ...tarefa(), reasoning: 'minimal' });

    assert.equal(chamadas.length, 1, 'insistir custaria um 400 por chamada, para sempre');
    assert.equal(generationConfigDe(0).thinkingConfig, undefined);
  });

  it('a recusa de um modelo não condena outro', async () => {
    process.env.GEMINI_MODEL = 'modelo-que-recusa';
    mockFetch(respostaDeErro(400, 'Request contains an invalid argument.'), respostaComTexto('{"ok": true}'));
    await geminiProvider.run({ ...tarefa(), reasoning: 'minimal' });

    // Trocar GEMINI_MODEL para um modelo novo precisa reabilitar a otimização.
    // Com um booleano por processo, ela ficaria desligada para sempre e em
    // silêncio — o defeito que o conjunto por modelo existe para impedir.
    process.env.GEMINI_MODEL = 'modelo-novo-em-folha';
    chamadas = [];
    mockFetch(respostaComTexto('{"ok": true}'));
    await geminiProvider.run({ ...tarefa(), reasoning: 'minimal' });

    assert.deepEqual(generationConfigDe(0).thinkingConfig, { thinkingLevel: 'low' });
  });
});
