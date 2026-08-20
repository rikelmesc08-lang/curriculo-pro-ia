import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { z } from 'zod';
import { AiError, type AiTask } from './provider';
import { geminiProvider } from './gemini';

/**
 * O prazo de uma tarefa vale para TODAS as tentativas somadas.
 *
 * O defeito que estes testes travam: com prazo por requisição, uma tarefa podia
 * fazer quatro chamadas (original, repetição por sobrecarga, retentativa de
 * formato, e a repetição por sobrecarga dela) e passar de três minutos —
 * enquanto a plataforma corta a função em 60s. O usuário receberia o erro
 * genérico da hospedagem, e o nosso tempo limite nunca chegaria a disparar.
 *
 * Nada aqui espera de verdade: o relógio é substituído.
 */

const schema = z.object({ ok: z.boolean() });

function tarefa(): AiTask<{ ok: boolean }> {
  return {
    name: 'prazo',
    system: 's',
    prompt: 'p',
    schema,
    maxTokens: 100,
    demo: () => ({ ok: false }),
  };
}

const fetchOriginal = globalThis.fetch;
const nowOriginal = Date.now;
const timeoutOriginal = AbortSignal.timeout;

/** Instante controlado, para o prazo poder ser adiantado sem esperar. */
let relogio = 0;

interface Chamada {
  /** Quanto do prazo restava quando esta chamada saiu. */
  timeoutPedido: number;
}

let chamadas: Chamada[] = [];

function texto(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

/**
 * Substitui o fetch. `avanco` diz quantos ms o relógio anda a cada chamada —
 * é assim que o prazo se esgota sem o teste dormir.
 */
function mockFetch(respostas: Response[], avanco = 0) {
  let indice = 0;
  globalThis.fetch = (async () => {
    relogio += avanco;
    const resposta = respostas[Math.min(indice, respostas.length - 1)];
    indice += 1;
    return resposta;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  chamadas = [];
  relogio = 1_000_000;
  Date.now = () => relogio;

  // O valor passado a `AbortSignal.timeout` não é legível depois — o objeto
  // não o expõe. Espionar a própria função é o único jeito honesto de
  // afirmar quanto prazo cada tentativa pediu.
  AbortSignal.timeout = ((ms: number) => {
    chamadas.push({ timeoutPedido: ms });
    return timeoutOriginal.call(AbortSignal, Math.max(ms, 1));
  }) as typeof AbortSignal.timeout;
  process.env.GEMINI_API_KEY = 'chave-de-teste';
  process.env.AI_PROVIDER = 'gemini';
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  Date.now = nowOriginal;
  AbortSignal.timeout = timeoutOriginal;
  delete process.env.GEMINI_API_KEY;
  delete process.env.AI_PROVIDER;
});

const RESPOSTA_BOA = () => texto({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }] });
const RESPOSTA_RUIM = () => texto({ candidates: [{ content: { parts: [{ text: 'nao e json' }] }, finishReason: 'STOP' }] });
const SOBRECARGA = () => texto({ error: { message: 'This model is currently experiencing high demand' } }, false, 503);

describe('prazo total da tarefa', () => {
  it('faz só uma chamada quando a primeira resposta serve', async () => {
    mockFetch([RESPOSTA_BOA()]);
    await geminiProvider.run(tarefa());
    assert.equal(chamadas.length, 1);
  });

  it('não inicia a retentativa de formato quando o prazo já se esgotou', async () => {
    // Cada chamada consome 48s do prazo de 50s. A primeira falha no schema; a
    // segunda não deve nem sair.
    mockFetch([RESPOSTA_RUIM()], 48_000);

    await assert.rejects(
      () => geminiProvider.run(tarefa()),
      (error: unknown) => error instanceof AiError
    );

    assert.equal(chamadas.length, 1, 'gastou cota numa tentativa que não tinha prazo para terminar');
  });

  it('ainda faz a retentativa de formato quando há prazo de sobra', async () => {
    // 2s por chamada: sobra prazo com folga para a segunda.
    mockFetch([RESPOSTA_RUIM(), RESPOSTA_BOA()], 2_000);
    const resultado = await geminiProvider.run(tarefa());
    assert.deepEqual(resultado, { ok: true });
    assert.equal(chamadas.length, 2);
  });

  it('não repete por sobrecarga quando o prazo não comporta a repetição', async () => {
    // Sobrecarga consumindo 45s: repetir custaria 2s de espera mais uma
    // tentativa inteira, e não cabe.
    mockFetch([SOBRECARGA()], 45_000);

    await assert.rejects(
      () => geminiProvider.run(tarefa()),
      (error: unknown) => error instanceof AiError && error.kind === 'rede'
    );

    assert.equal(chamadas.length, 1);
  });

  it('o tempo pedido a cada chamada nunca ultrapassa o que resta do prazo', async () => {
    mockFetch([RESPOSTA_RUIM(), RESPOSTA_BOA()], 20_000);
    await geminiProvider.run(tarefa());

    // A segunda chamada tem que pedir menos tempo que a primeira: o prazo é
    // compartilhado, e 20s já foram gastos.
    assert.equal(chamadas.length, 2);
    assert.ok(
      chamadas[1].timeoutPedido < chamadas[0].timeoutPedido,
      'a segunda tentativa reabriu o prazo cheio em vez de usar o que restava'
    );
  });

  it('a soma dos tempos pedidos cabe no teto da plataforma', async () => {
    mockFetch([RESPOSTA_RUIM(), RESPOSTA_BOA()], 1_000);
    await geminiProvider.run(tarefa());

    // `maxDuration = 60` nas rotas. Com prazo por requisição, esta soma dava
    // 110s e a plataforma cortava antes.
    const somaMaxima = chamadas[0].timeoutPedido + 1_000;
    assert.ok(somaMaxima <= 60_000, `pior caso somou ${somaMaxima}ms, acima do teto de 60s`);
  });
});
