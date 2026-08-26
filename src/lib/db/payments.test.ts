import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

/**
 * `src/lib/db/payments.ts` no driver local — sem passar pela rota do
 * webhook, para isolar o que é comportamento do módulo de acesso a dados do
 * que é orquestração da rota (que tem seu próprio arquivo de teste em
 * `src/app/api/pagamento/webhook/route.test.ts`).
 *
 * O FOCO AQUI: `definirPlano` só deveria ser chamado com `'pro'` depois de um
 * status `pago` de verdade — mas ela mesma NÃO SABE disso. Ela grava
 * literalmente o que mandarem. A garantia real mora em quem chama (a rota do
 * webhook), e é isso que este arquivo comprova: aqui embaixo, no armazenamento,
 * não existe validação nenhuma escondida — só o comportamento cru de gravação.
 */

const dataDir = mkdtempSync(join(tmpdir(), 'cpro-payments-db-'));
process.env.LOCAL_DATA_DIR = dataDir;
process.env.DB_DRIVER = 'local';

import { mutate, read as lerBanco } from './local/store';
import {
  anotarPreferencia,
  buscarPagamento,
  criarPagamento,
  definirPlano,
  liquidarPagamento,
  listarPagamentos,
} from './payments';

after(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.LOCAL_DATA_DIR;
  delete process.env.DB_DRIVER;
});

async function criarUsuario(plan: 'gratuito' | 'pro' = 'gratuito'): Promise<string> {
  const id = randomUUID();
  await mutate((data) => {
    data.users.push({
      id,
      email: `${id}@exemplo.test`,
      name: 'Usuário de Teste',
      plan,
      passwordHash: 'x',
      createdAt: new Date().toISOString(),
    });
  });
  return id;
}

async function planoDe(ownerId: string) {
  return lerBanco((data) => data.users.find((u) => u.id === ownerId)?.plan);
}

describe('criarPagamento', () => {
  it('nasce pendente, sem paymentRef nem preferenceRef', async () => {
    const ownerId = await criarUsuario();
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: 2790 });

    assert.equal(pagamento.status, 'pendente');
    assert.equal(pagamento.paymentRef, null);
    assert.equal(pagamento.preferenceRef, null);
    assert.equal(pagamento.amountCents, 2790);
    assert.equal(pagamento.currency, 'BRL');
    assert.ok(pagamento.id);
  });

  it('duas tentativas de compra da mesma pessoa geram duas linhas distintas', async () => {
    const ownerId = await criarUsuario();
    const p1 = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: 2790 });
    const p2 = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: 2790 });

    assert.notEqual(p1.id, p2.id);
    const lista = await listarPagamentos(ownerId);
    assert.equal(lista.length, 2);
  });
});

describe('buscarPagamento', () => {
  it('devolve null para um id que não existe', async () => {
    assert.equal(await buscarPagamento(randomUUID()), null);
  });

  it('devolve null para string vazia', async () => {
    assert.equal(await buscarPagamento(''), null);
  });
});

describe('listarPagamentos', () => {
  it('lista vazia para quem nunca comprou', async () => {
    assert.deepEqual(await listarPagamentos(randomUUID()), []);
  });

  it('não mistura pagamento de contas diferentes', async () => {
    const ana = await criarUsuario();
    const bruno = await criarUsuario();
    await criarPagamento({ ownerId: ana, provider: 'mercadopago', amountCents: 2790 });
    await criarPagamento({ ownerId: bruno, provider: 'mercadopago', amountCents: 2790 });

    const listaDaAna = await listarPagamentos(ana);
    assert.equal(listaDaAna.length, 1);
    assert.ok(listaDaAna.every((p) => p.ownerId === ana));
  });

  it('vem da mais recente para a mais antiga', async () => {
    const ownerId = await criarUsuario();
    const primeiro = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: 2790 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const segundo = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: 2790 });

    const lista = await listarPagamentos(ownerId);
    assert.equal(lista[0]?.id, segundo.id);
    assert.equal(lista[1]?.id, primeiro.id);
  });
});

describe('anotarPreferencia', () => {
  it('guarda o id do pedido criado no provedor', async () => {
    const ownerId = await criarUsuario();
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: 2790 });

    await anotarPreferencia(pagamento.id, 'pref-123');

    const atualizado = await buscarPagamento(pagamento.id);
    assert.equal(atualizado?.preferenceRef, 'pref-123');
  });

  it('não estoura ao anotar um id de pagamento que não existe', async () => {
    await assert.doesNotReject(() => anotarPreferencia(randomUUID(), 'pref-fantasma'));
  });
});

describe('liquidarPagamento', () => {
  it('devolve "nao-encontrado" para um paymentId que não existe, sem gravar nada', async () => {
    const resultado = await liquidarPagamento({
      paymentId: randomUUID(),
      paymentRef: 'ref-mp-1',
      status: 'pago',
    });

    assert.deepEqual(resultado, { desfecho: 'nao-encontrado' });
  });

  it('recusa transição inválida e devolve o pagamento como estava, sem alterar amountCents', async () => {
    const ownerId = await criarUsuario();
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: 2790 });
    await liquidarPagamento({ paymentId: pagamento.id, paymentRef: 'ref-1', status: 'pago' });

    // pago -> pendente é a transição que a notificação atrasada tentaria.
    const resultado = await liquidarPagamento({ paymentId: pagamento.id, paymentRef: 'ref-2', status: 'pendente' });

    assert.equal(resultado.desfecho, 'ignorado');
    if (resultado.desfecho === 'ignorado') {
      assert.equal(resultado.pagamento.status, 'pago');
      assert.equal(resultado.pagamento.amountCents, 2790);
      // O paymentRef da tentativa de rebaixamento não pode ter sobrescrito o
      // ref legítimo do pagamento aprovado.
      assert.equal(resultado.pagamento.paymentRef, 'ref-1');
    }
  });

  it('liquidação bem-sucedida grava o novo paymentRef e o novo status', async () => {
    const ownerId = await criarUsuario();
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: 2790 });

    const resultado = await liquidarPagamento({ paymentId: pagamento.id, paymentRef: 'ref-mp-xyz', status: 'pago' });

    assert.equal(resultado.desfecho, 'atualizado');
    if (resultado.desfecho === 'atualizado') {
      assert.equal(resultado.pagamento.status, 'pago');
      assert.equal(resultado.pagamento.paymentRef, 'ref-mp-xyz');
    }

    const persistido = await buscarPagamento(pagamento.id);
    assert.equal(persistido?.status, 'pago');
    assert.equal(persistido?.paymentRef, 'ref-mp-xyz');
  });
});

describe('definirPlano', () => {
  it('muda o plano para pro', async () => {
    const ownerId = await criarUsuario('gratuito');
    await definirPlano(ownerId, 'pro');
    assert.equal(await planoDe(ownerId), 'pro');
  });

  it('muda o plano de volta para gratuito', async () => {
    const ownerId = await criarUsuario('pro');
    await definirPlano(ownerId, 'gratuito');
    assert.equal(await planoDe(ownerId), 'gratuito');
  });

  it('não afeta o plano de outra conta', async () => {
    const ana = await criarUsuario('gratuito');
    const bruno = await criarUsuario('gratuito');

    await definirPlano(ana, 'pro');

    assert.equal(await planoDe(ana), 'pro');
    assert.equal(await planoDe(bruno), 'gratuito', 'definirPlano vazou para outra conta');
  });

  it('não estoura para um ownerId que não existe — só não faz nada', async () => {
    await assert.doesNotReject(() => definirPlano(randomUUID(), 'pro'));
  });
});
