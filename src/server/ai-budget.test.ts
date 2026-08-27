import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { AiError } from '@/services/ai';
import type { AiEnvelope } from '@/types/ai';
import { runWithBudget } from './ai-budget';

/**
 * Controle de custo das chamadas de IA.
 *
 * É a única coisa entre uma sessão autenticada e uma conta de API do Google
 * aberta ao mundo: sem esta camada, um login válido e um laço de repetição
 * bastam para esgotar a chave do projeto. Os três comportamentos testados
 * aqui — cache que evita chamada repetida, limite por hora/dia que contém o
 * abuso, e quais falhas NÃO consomem cota — são justamente os que nunca
 * aparecem rodando `npm run dev` na mão, e sempre aparecem em produção sob
 * uso real ou ataque.
 *
 * O driver `local` é usado como repositório de verdade, gravando num
 * diretório temporário — é I/O em disco, não rede: nenhum teste aqui chama a
 * API do Google, o Supabase ou exige chave nenhuma. Cada teste ganha um
 * diretório e um usuário novos, para os contadores por hora/dia de um teste
 * não vazarem para o próximo.
 */

let dataDir: string;

function envelope<T>(data: T): AiEnvelope<T> {
  return { mode: 'real', data };
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'cpro-budget-'));
  process.env.LOCAL_DATA_DIR = dataDir;
  process.env.DB_DRIVER = 'local';
  // Provedor "gemini" só para `aiModeIsDemo()` devolver false — a chamada de
  // rede de verdade nunca acontece porque `run` é sempre a função de mentira
  // passada pelo teste, nunca `geminiProvider.run`.
  process.env.AI_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'chave-de-teste-nunca-usada';
  delete process.env.AI_HOURLY_LIMIT;
  delete process.env.AI_DAILY_LIMIT;
  delete process.env.AI_CACHE_MINUTES;
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.LOCAL_DATA_DIR;
  delete process.env.DB_DRIVER;
  delete process.env.AI_PROVIDER;
  delete process.env.GEMINI_API_KEY;
  delete process.env.AI_HOURLY_LIMIT;
  delete process.env.AI_DAILY_LIMIT;
  delete process.env.AI_CACHE_MINUTES;
});

describe('cache por pergunta', () => {
  it('não chama a tarefa de novo para a mesma pergunta — devolve do cache', async () => {
    const userId = randomUUID();
    let chamadas = 0;
    const run = async () => {
      chamadas += 1;
      return envelope({ score: 42 });
    };

    const primeira = await runWithBudget(userId, 'reviewResume', { texto: 'abc' }, run);
    assert.equal(primeira.cached, undefined);
    assert.equal(chamadas, 1);

    const segunda = await runWithBudget(userId, 'reviewResume', { texto: 'abc' }, run);
    assert.equal(chamadas, 1, 'a segunda chamada gastou uma chamada nova em vez de usar o cache');
    assert.equal(segunda.cached, true);
    assert.deepEqual(segunda.data, { score: 42 });
  });

  it('entradas diferentes não compartilham cache', async () => {
    const userId = randomUUID();
    let chamadas = 0;
    const run = async () => {
      chamadas += 1;
      return envelope({ v: chamadas });
    };

    await runWithBudget(userId, 'reviewResume', { texto: 'abc' }, run);
    const segunda = await runWithBudget(userId, 'reviewResume', { texto: 'diferente' }, run);

    assert.equal(chamadas, 2, 'entradas diferentes foram tratadas como a mesma pergunta');
    assert.equal(segunda.cached, undefined);
  });

  it('tarefas diferentes com a mesma entrada não compartilham cache', async () => {
    const userId = randomUUID();
    const run = async () => envelope({ ok: true });

    await runWithBudget(userId, 'reviewResume', { texto: 'abc' }, run);
    const segunda = await runWithBudget(userId, 'analyzeAts', { texto: 'abc' }, run);

    assert.equal(segunda.cached, undefined, 'uma tarefa serviu do cache de outra tarefa');
  });

  it('usuários diferentes não compartilham cache — a resposta de um não vaza para o outro', async () => {
    const ana = randomUUID();
    const bruno = randomUUID();
    const run = async () => envelope({ ok: true });

    await runWithBudget(ana, 'reviewResume', { texto: 'abc' }, run);
    const doBruno = await runWithBudget(bruno, 'reviewResume', { texto: 'abc' }, run);

    assert.equal(doBruno.cached, undefined, 'Bruno recebeu do cache uma resposta que nunca pediu');
  });

  it('AI_CACHE_MINUTES=0 desliga o cache', async () => {
    process.env.AI_CACHE_MINUTES = '0';
    const userId = randomUUID();
    let chamadas = 0;
    const run = async () => {
      chamadas += 1;
      return envelope({ v: chamadas });
    };

    await runWithBudget(userId, 'reviewResume', { texto: 'abc' }, run);
    await runWithBudget(userId, 'reviewResume', { texto: 'abc' }, run);

    assert.equal(chamadas, 2, 'com o cache desligado a segunda chamada devia ter rodado de novo');
  });

  it('resposta servida do cache não consome a cota, mesmo com o limite já esgotado', async () => {
    process.env.AI_HOURLY_LIMIT = '1';
    const userId = randomUUID();
    const run = async () => envelope({ ok: true });

    // Consome o único lugar da hora.
    await runWithBudget(userId, 'reviewResume', { texto: 'abc' }, run);

    // Mesma pergunta: bate no cache antes de a checagem de cota rodar.
    const doCache = await runWithBudget(userId, 'reviewResume', { texto: 'abc' }, run);
    assert.equal(doCache.cached, true);

    // Pergunta nova: aí sim esbarra no limite já esgotado.
    await assert.rejects(
      () => runWithBudget(userId, 'reviewResume', { texto: 'outra' }, run),
      (error: unknown) => error instanceof AiError && error.kind === 'cota'
    );
  });
});

describe('limite por hora', () => {
  it('deixa passar até o limite e bloqueia a próxima', async () => {
    process.env.AI_HOURLY_LIMIT = '3';
    process.env.AI_DAILY_LIMIT = '1000';
    const userId = randomUUID();
    const run = async () => envelope({ ok: true });

    for (let i = 0; i < 3; i++) {
      await runWithBudget(userId, 'reviewResume', { i }, run);
    }

    await assert.rejects(
      () => runWithBudget(userId, 'reviewResume', { i: 'excedente' }, run),
      (error: unknown) => {
        assert.ok(error instanceof AiError);
        assert.equal(error.kind, 'cota');
        assert.match(error.userMessage, /limite/i);
        return true;
      }
    );
  });

  it('o limite de um usuário não bloqueia outro', async () => {
    process.env.AI_HOURLY_LIMIT = '1';
    process.env.AI_DAILY_LIMIT = '1000';
    const ana = randomUUID();
    const bruno = randomUUID();
    const run = async () => envelope({ ok: true });

    await runWithBudget(ana, 'reviewResume', { texto: 'a' }, run);
    await assert.rejects(() => runWithBudget(ana, 'reviewResume', { texto: 'b' }, run));

    // Bruno nunca chamou — não pode herdar o bloqueio da Ana.
    const resultado = await runWithBudget(bruno, 'reviewResume', { texto: 'a' }, run);
    assert.deepEqual(resultado.data, { ok: true });
  });
});

describe('limite diário', () => {
  it('bloqueia mesmo com folga na hora, quando o diário esgota primeiro', async () => {
    process.env.AI_HOURLY_LIMIT = '1000';
    process.env.AI_DAILY_LIMIT = '2';
    const userId = randomUUID();
    const run = async () => envelope({ ok: true });

    await runWithBudget(userId, 'reviewResume', { i: 1 }, run);
    await runWithBudget(userId, 'reviewResume', { i: 2 }, run);

    await assert.rejects(
      () => runWithBudget(userId, 'reviewResume', { i: 3 }, run),
      (error: unknown) => {
        assert.ok(error instanceof AiError);
        assert.equal(error.kind, 'cota');
        assert.match(error.message, /[Dd]i[aá]ri/);
        return true;
      }
    );
  });

  it('checa a hora antes do dia — estourar os dois relata o da hora', async () => {
    process.env.AI_HOURLY_LIMIT = '1';
    process.env.AI_DAILY_LIMIT = '1';
    const userId = randomUUID();
    const run = async () => envelope({ ok: true });

    await runWithBudget(userId, 'reviewResume', { i: 1 }, run);

    await assert.rejects(
      () => runWithBudget(userId, 'reviewResume', { i: 2 }, run),
      (error: unknown) => {
        assert.ok(error instanceof AiError);
        assert.match(error.message, /[Hh]ora/);
        return true;
      }
    );
  });
});

describe('falhas e cota (SEM_CUSTO)', () => {
  it('falha genérica (erro que não é AiError) conta contra o limite', async () => {
    process.env.AI_HOURLY_LIMIT = '1';
    const userId = randomUUID();

    await assert.rejects(() =>
      runWithBudget(userId, 'reviewResume', { texto: 'abc' }, async () => {
        throw new Error('o modelo caiu no meio da resposta');
      })
    );

    // O hourly limit (1) já foi consumido pela tentativa que falhou.
    await assert.rejects(
      () => runWithBudget(userId, 'reviewResume', { texto: 'outra' }, async () => envelope({ ok: true })),
      (error: unknown) => error instanceof AiError && error.kind === 'cota'
    );
  });

  it('AiError de kind "formato" conta contra o limite', async () => {
    process.env.AI_HOURLY_LIMIT = '1';
    const userId = randomUUID();

    await assert.rejects(() =>
      runWithBudget(userId, 'reviewResume', { texto: 'abc' }, async () => {
        throw new AiError('formato', 'reviewResume', 'resposta fora do schema');
      })
    );

    await assert.rejects(
      () => runWithBudget(userId, 'reviewResume', { texto: 'outra' }, async () => envelope({ ok: true })),
      (error: unknown) => error instanceof AiError && error.kind === 'cota'
    );
  });

  it('AiError de kind "bloqueio" conta contra o limite', async () => {
    process.env.AI_HOURLY_LIMIT = '1';
    const userId = randomUUID();

    await assert.rejects(() =>
      runWithBudget(userId, 'reviewResume', { texto: 'abc' }, async () => {
        throw new AiError('bloqueio', 'reviewResume', 'filtro de segurança recusou');
      })
    );

    await assert.rejects(
      () => runWithBudget(userId, 'reviewResume', { texto: 'outra' }, async () => envelope({ ok: true })),
      (error: unknown) => error instanceof AiError && error.kind === 'cota'
    );
  });

  it('AiError de kind "configuracao" NÃO conta contra o limite', async () => {
    process.env.AI_HOURLY_LIMIT = '1';
    const userId = randomUUID();

    await assert.rejects(() =>
      runWithBudget(userId, 'reviewResume', { texto: 'abc' }, async () => {
        throw new AiError('configuracao', 'reviewResume', 'chave ausente');
      })
    );

    // O hourly limit continua em zero — a próxima chamada tem que passar.
    const resultado = await runWithBudget(
      userId,
      'reviewResume',
      { texto: 'outra' },
      async () => envelope({ ok: true })
    );
    assert.deepEqual(resultado.data, { ok: true });
  });

  it('AiError de kind "cota" lançada por dentro da tarefa também não conta contra o limite', async () => {
    process.env.AI_HOURLY_LIMIT = '1';
    const userId = randomUUID();

    await assert.rejects(() =>
      runWithBudget(userId, 'reviewResume', { texto: 'abc' }, async () => {
        throw new AiError('cota', 'reviewResume', 'um limite interno do próprio provedor');
      })
    );

    // O hourly limit deste controle (1) continua em zero: a chamada seguinte
    // tem que passar, e não ser barrada por uma "falha" que nunca devia ter
    // sido registrada.
    const resultado = await runWithBudget(
      userId,
      'reviewResume',
      { texto: 'outra' },
      async () => envelope({ ok: true })
    );
    assert.deepEqual(resultado.data, { ok: true });
  });

  it('estourar o limite de verdade bloqueia a próxima tentativa (a checagem em si não é "gratuita" infinitamente)', async () => {
    process.env.AI_HOURLY_LIMIT = '1';
    const userId = randomUUID();
    const run = async () => envelope({ ok: true });

    // Consome a única vaga da hora de verdade.
    await runWithBudget(userId, 'reviewResume', { i: 1 }, run);

    // Estoura o limite — o próprio `runWithBudget` lança 'cota' antes de
    // chamar `run`.
    await assert.rejects(
      () => runWithBudget(userId, 'reviewResume', { i: 2 }, run),
      (error: unknown) => error instanceof AiError && error.kind === 'cota'
    );

    // A vaga da hora continua ocupada — o bloqueio persiste, não "libera" por
    // ter recusado uma vez.
    await assert.rejects(
      () => runWithBudget(userId, 'reviewResume', { i: 3 }, run),
      (error: unknown) => error instanceof AiError && error.kind === 'cota'
    );
  });

  it('sucesso alimenta o cache da próxima chamada igual', async () => {
    const userId = randomUUID();
    let chamadas = 0;
    const run = async () => {
      chamadas += 1;
      return envelope({ resultado: 'ok' });
    };

    await runWithBudget(userId, 'reviewResume', { texto: 'abc' }, run);
    const segunda = await runWithBudget(userId, 'reviewResume', { texto: 'abc' }, run);

    assert.equal(chamadas, 1);
    assert.equal(segunda.cached, true);
  });
});

describe('corrida de concorrência (TOCTOU)', () => {
  /**
   * O DEFEITO QUE ESTE TESTE COBRE: antes da correção, `countAiCalls` lia o
   * uso e só bem depois — depois de `run()`, que é a chamada de rede e leva
   * segundos — `recordAiCall` gravava. Um usuário disparando N Server Actions
   * verdadeiramente em paralelo (`Promise.all`, uma entrada diferente por
   * chamada para não cair no cache) fazia todas lerem a MESMA contagem, porque
   * nenhuma tinha gravado ainda, e todas passavam — furando o teto
   * proporcionalmente ao paralelismo.
   *
   * O atraso dentro de `run()` abaixo reproduz de propósito o "a chamada de
   * IA leva um tempo" que a corrida explorava. Sem a reserva antes de rodar,
   * as 10 chamadas veriam a contagem zerada ao mesmo tempo e as 10 passariam
   * — este teste falha no código antigo (fica `sucesso === 10`, não `3`) e
   * passa depois da correção.
   */
  it('N chamadas verdadeiramente paralelas do mesmo usuário não ultrapassam o teto', async () => {
    process.env.AI_HOURLY_LIMIT = '3';
    process.env.AI_DAILY_LIMIT = '1000';
    const userId = randomUUID();
    const total = 10;
    let chamadasReais = 0;

    const run = async () => {
      chamadasReais += 1;
      // A janela que o TOCTOU explorava: o tempo de uma chamada de IA de
      // verdade, em que nenhuma gravação tinha acontecido ainda.
      await new Promise((resolve) => setTimeout(resolve, 20));
      return envelope({ ok: true });
    };

    const resultados = await Promise.allSettled(
      Array.from({ length: total }, (_, i) => runWithBudget(userId, 'reviewResume', { i }, run))
    );

    const sucesso = resultados.filter((resultado) => resultado.status === 'fulfilled').length;
    const falhas = resultados.filter((resultado) => resultado.status === 'rejected').length;

    for (const resultado of resultados) {
      if (resultado.status === 'rejected') {
        assert.ok(
          resultado.reason instanceof AiError && resultado.reason.kind === 'cota',
          'a chamada recusada devia ser por cota, não por outro erro'
        );
      }
    }

    assert.equal(sucesso, 3, `deveria deixar passar exatamente o limite (3); passaram ${sucesso}`);
    assert.equal(falhas, total - 3);
    assert.equal(
      chamadasReais,
      3,
      'a tarefa de IA rodou mais vezes do que o limite permitia — a reserva não fechou a corrida'
    );
  });

  it('o mesmo cenário, com o limite diário como o mais apertado, também não é furado', async () => {
    process.env.AI_HOURLY_LIMIT = '1000';
    process.env.AI_DAILY_LIMIT = '2';
    const userId = randomUUID();
    const total = 8;
    let chamadasReais = 0;

    const run = async () => {
      chamadasReais += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return envelope({ ok: true });
    };

    const resultados = await Promise.allSettled(
      Array.from({ length: total }, (_, i) => runWithBudget(userId, 'reviewResume', { i }, run))
    );

    const sucesso = resultados.filter((resultado) => resultado.status === 'fulfilled').length;

    assert.equal(sucesso, 2, `deveria deixar passar exatamente o limite diário (2); passaram ${sucesso}`);
    assert.equal(chamadasReais, 2);
  });
});

describe('modo demonstração', () => {
  it('pula cache e limite inteiramente — corre a tarefa sempre', async () => {
    process.env.AI_PROVIDER = 'demo';
    delete process.env.GEMINI_API_KEY;
    process.env.AI_HOURLY_LIMIT = '1';
    const userId = randomUUID();
    let chamadas = 0;
    const run = async () => {
      chamadas += 1;
      return envelope({ v: chamadas });
    };

    // O limite está em 1, mas em modo demo ele nunca é sequer consultado.
    for (let i = 0; i < 5; i++) {
      const resultado = await runWithBudget(userId, 'reviewResume', { texto: 'sempre igual' }, run);
      assert.equal(resultado.cached, undefined, 'modo demo não deveria nem consultar o cache');
    }

    assert.equal(chamadas, 5, 'modo demo deveria rodar a tarefa toda vez, nunca servir do cache');
  });
});
