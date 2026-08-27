import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { localRepository } from './repository';

/**
 * Contador de uso e cache da IA, no driver que roda por padrão.
 *
 * Estes três métodos são o que sustenta o controle de custo. O modo de falha é
 * silencioso: se `countAiCalls` contar errado, o limite não segura nada e a
 * única evidência é a fatura; se `findAiCall` devolver o registro de outro
 * usuário, a pessoa recebe a análise do currículo alheio.
 *
 * O teste grava num diretório temporário. `LOCAL_DATA_DIR` é lido a cada
 * operação (é função, não constante), então basta estar no ambiente antes da
 * primeira chamada — não antes do import.
 */

const dataDir = mkdtempSync(join(tmpdir(), 'cpro-test-'));
process.env.LOCAL_DATA_DIR = dataDir;
process.env.DB_DRIVER = 'local';

const ANA = 'usuario-ana';
const BRUNO = 'usuario-bruno';
const UMA_HORA_ATRAS = new Date(Date.now() - 60 * 60_000).toISOString();
const ONTEM = new Date(Date.now() - 25 * 60 * 60_000).toISOString();

before(async () => {
  await localRepository.recordAiCall(ANA, { task: 'reviewResume', fingerprint: 'aaa', result: { score: 70 } });
  await localRepository.recordAiCall(ANA, { task: 'analyzeAts', fingerprint: 'bbb', result: { score: 55 } });
  await localRepository.recordAiCall(BRUNO, { task: 'reviewResume', fingerprint: 'aaa', result: { score: 10 } });
});

after(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.LOCAL_DATA_DIR;
  delete process.env.DB_DRIVER;
});

describe('registro de chamadas de IA (driver local)', () => {
  it('conta só as chamadas do próprio usuário', async () => {
    assert.equal(await localRepository.countAiCalls(ANA, UMA_HORA_ATRAS), 2);
    assert.equal(await localRepository.countAiCalls(BRUNO, UMA_HORA_ATRAS), 1);
  });

  it('não conta nada fora da janela', async () => {
    const daquiUmMinuto = new Date(Date.now() + 60_000).toISOString();
    assert.equal(await localRepository.countAiCalls(ANA, daquiUmMinuto), 0);
  });

  it('conta zero para quem nunca chamou', async () => {
    assert.equal(await localRepository.countAiCalls('ninguem', ONTEM), 0);
  });

  it('devolve o resultado guardado para a mesma pergunta', async () => {
    const achado = await localRepository.findAiCall(ANA, 'aaa', UMA_HORA_ATRAS);
    assert.ok(achado);
    assert.deepEqual(achado.result, { score: 70 });
    assert.equal(achado.task, 'reviewResume');
  });

  /**
   * O teste que mais importa: Ana e Bruno têm o MESMO fingerprint 'aaa'. Sem o
   * filtro por dono, um deles receberia a análise do currículo do outro.
   */
  it('nunca cruza o cache de um usuário com o de outro', async () => {
    const deBruno = await localRepository.findAiCall(BRUNO, 'aaa', UMA_HORA_ATRAS);
    assert.ok(deBruno);
    assert.deepEqual(deBruno.result, { score: 10 }, 'Bruno recebeu o resultado da Ana');
  });

  it('não devolve nada para pergunta diferente', async () => {
    assert.equal(await localRepository.findAiCall(ANA, 'nao-existe', UMA_HORA_ATRAS), null);
  });

  it('não devolve nada quando o registro está fora da janela do cache', async () => {
    const daquiUmMinuto = new Date(Date.now() + 60_000).toISOString();
    assert.equal(await localRepository.findAiCall(ANA, 'aaa', daquiUmMinuto), null);
  });

  it('devolve o registro mais recente quando a pergunta se repete', async () => {
    await localRepository.recordAiCall(ANA, { task: 'reviewResume', fingerprint: 'ccc', result: { v: 1 } });
    // ISO tem precisão de milissegundo; sem a espera os dois registros podem
    // carimbar o mesmo instante e o teste passaria por sorte.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await localRepository.recordAiCall(ANA, { task: 'reviewResume', fingerprint: 'ccc', result: { v: 2 } });

    const achado = await localRepository.findAiCall(ANA, 'ccc', UMA_HORA_ATRAS);
    assert.deepEqual(achado?.result, { v: 2 });
  });

  /**
   * Tentativa que falhou também consome cota — mas não pode virar cache.
   *
   * `ai-budget` grava a falha com um fingerprint prefixado por "falha:" e
   * carimbado com o instante, justamente para nenhuma consulta de cache
   * casar com ela. Sem esse cuidado, a tentativa fracassada seria servida
   * como se fosse resultado, com conteúdo nulo, em toda repetição da mesma
   * pergunta — trocando um problema de custo por um de correção.
   */
  it('falha conta no limite mas nunca é servida do cache', async () => {
    const chave = 'a'.repeat(64);
    const antes = await localRepository.countAiCalls(ANA, UMA_HORA_ATRAS);

    await localRepository.recordAiCall(ANA, {
      task: 'falha:reviewResume',
      fingerprint: `falha:${chave}:${Date.now()}`,
      // Objeto vazio, não `null`: a coluna é `jsonb not null` no Postgres.
      result: {},
    });

    assert.equal(
      await localRepository.countAiCalls(ANA, UMA_HORA_ATRAS),
      antes + 1,
      'a tentativa que falhou não entrou na contagem do limite'
    );

    assert.equal(
      await localRepository.findAiCall(ANA, chave, UMA_HORA_ATRAS),
      null,
      'a tentativa que falhou foi encontrada pelo cache'
    );
  });

  /**
   * `deleteAiCall` desfaz UMA reserva por id — é o que fecha a corrida em
   * `src/server/ai-budget.ts` (reserva antes de rodar a IA, apaga se a reserva
   * não virar chamada de verdade). Filtra por dono pelo mesmo motivo de todo
   * método deste contrato.
   */
  it('deleteAiCall apaga só o registro pedido, e só se for do dono', async () => {
    const { id } = await localRepository.recordAiCall(ANA, {
      task: 'reserva:reviewResume',
      fingerprint: 'reserva-teste',
      result: {},
    });
    const antes = await localRepository.countAiCalls(ANA, ONTEM);

    // Bruno não pode apagar a reserva da Ana.
    await localRepository.deleteAiCall(BRUNO, id);
    assert.equal(await localRepository.countAiCalls(ANA, ONTEM), antes, 'um id de outro dono apagou o registro');

    await localRepository.deleteAiCall(ANA, id);
    assert.equal(await localRepository.countAiCalls(ANA, ONTEM), antes - 1);
  });

  /**
   * `upTo` transforma a contagem em "posição na fila" — ver o comentário de
   * topo de `src/server/ai-budget.ts`. O caso que mais importa é o de várias
   * reservas caindo no MESMO milissegundo: `createdAt` sozinho não consegue
   * distingui-las, e sem o desempate por `id` todas empatariam na mesma
   * posição, furando o teto exatamente na rajada paralela que este parâmetro
   * existe para conter.
   */
  it('upTo conta a posição na fila, com o id desempatando linhas do mesmo milissegundo', async () => {
    const usuario = 'usuario-fila';
    const desde = new Date(Date.now() - 60_000).toISOString();

    const reservas = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        localRepository.recordAiCall(usuario, {
          task: 'reserva:teste',
          fingerprint: `reserva-fila-${i}`,
          result: {},
        })
      )
    );

    // Ordena pela mesma regra de posição que `countAiCalls` usa internamente:
    // `createdAt` e, em caso de empate, `id`.
    const ordenadas = [...reservas].sort((a, b) =>
      a.createdAt !== b.createdAt ? a.createdAt.localeCompare(b.createdAt) : a.id.localeCompare(b.id)
    );

    for (let posicao = 0; posicao < ordenadas.length; posicao++) {
      const contagem = await localRepository.countAiCalls(usuario, desde, ordenadas[posicao]);
      assert.equal(
        contagem,
        posicao + 1,
        `a reserva na posição ${posicao + 1} da fila deveria contar exatamente ${posicao + 1}`
      );
    }
  });

  it('apaga os registros junto com a conta', async () => {
    await localRepository.recordAiCall('quem-vai-sair', { task: 't', fingerprint: 'zzz', result: {} });
    assert.equal(await localRepository.countAiCalls('quem-vai-sair', ONTEM), 1);

    await localRepository.deleteUserData('quem-vai-sair');

    // O registro guarda texto derivado do currículo. Exclusão parcial faria a
    // tela de configurações prometer o que não cumpre.
    assert.equal(await localRepository.countAiCalls('quem-vai-sair', ONTEM), 0);
    assert.equal(await localRepository.findAiCall('quem-vai-sair', 'zzz', ONTEM), null);

    // E não pode levar o de mais ninguém junto.
    assert.equal(await localRepository.countAiCalls(ANA, ONTEM), 5);
  });
});
