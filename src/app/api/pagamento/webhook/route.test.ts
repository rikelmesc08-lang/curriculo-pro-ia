import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, describe, it } from 'node:test';
import { mutate, read as lerBanco } from '@/lib/db/local/store';
import { buscarPagamento, criarPagamento, listarPagamentos } from '@/lib/db/payments';
import { POST } from './route';

/**
 * A rota de webhook, do jeito que ela é chamada de verdade: um POST com corpo
 * e cabeçalhos, não a função interna isolada.
 *
 * O QUE ESTE ARQUIVO PROTEGE, na ordem de importância do dono do produto:
 *
 *   1. Notificação repetida não duplica cobrança nem libera o plano duas
 *      vezes — é o requisito explícito antes da primeira venda de verdade.
 *   2. Notificação fora de ordem (o "pendente" atrasado) não rebaixa quem já
 *      pagou.
 *   3. Estorno tira o acesso; nada depois de "estornado" devolve ele.
 *   4. Referência que não é nossa, e valor que não cobre o preço, são
 *      recusados sem tocar em plano nenhum.
 *
 * O PROVEDOR É DUBLÊ: `globalThis.fetch` é substituído antes de cada teste
 * pela resposta que o Mercado Pago daria para `GET /v1/payments/:id` — nunca
 * a rede de verdade. O corpo do POST em si é só o "olhe o pagamento X"; quem
 * decide o status é sempre essa resposta mockada, exatamente como a rota
 * exige (comentário "3." em route.ts).
 */

const SEGREDO = 'segredo-de-teste-do-webhook';
const dataDir = mkdtempSync(join(tmpdir(), 'cpro-webhook-'));
process.env.LOCAL_DATA_DIR = dataDir;
process.env.DB_DRIVER = 'local';
process.env.MERCADOPAGO_WEBHOOK_SECRET = SEGREDO;
process.env.MERCADOPAGO_ACCESS_TOKEN = 'token-de-teste-nao-usado-em-rede';

after(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.LOCAL_DATA_DIR;
  delete process.env.DB_DRIVER;
  delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
  delete process.env.MERCADOPAGO_ACCESS_TOKEN;
});

// --- infraestrutura do teste -------------------------------------------

function assinar(dataId: string, requestId: string | null, ts: number, segredo = SEGREDO): string {
  const manifesto = `id:${dataId.toLowerCase()};` + (requestId ? `request-id:${requestId};` : '') + `ts:${ts};`;
  const v1 = createHmac('sha256', segredo).update(manifesto).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

/** O que o Mercado Pago devolveria para `GET /v1/payments/:id`. */
interface RespostaProvedor {
  status: string;
  external_reference: string | null;
  transaction_amount: number | null;
  currency_id: string;
}

let ultimaChamadaDeRede: string | null = null;

function mockarFetchPayment(resposta: RespostaProvedor | 'nao-deve-ser-chamado'): void {
  ultimaChamadaDeRede = null;
  (globalThis as { fetch: typeof fetch }).fetch = (async (url: string | URL) => {
    ultimaChamadaDeRede = String(url);
    if (resposta === 'nao-deve-ser-chamado') {
      throw new Error('a rota chamou a API do provedor quando não deveria — checagem anterior falhou em barrar');
    }
    return new Response(JSON.stringify(resposta), { status: 200 });
  }) as typeof fetch;
}

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

/** Notificação de pagamento, assinada corretamente, pronta para POST. */
function notificacao(dataId: string, opts: { requestId?: string | null; segredo?: string; ts?: number } = {}) {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const requestId = opts.requestId === undefined ? 'req-1' : opts.requestId;
  const corpo = JSON.stringify({ type: 'payment', data: { id: dataId } });

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-signature': assinar(dataId, requestId, ts, opts.segredo),
  };
  if (requestId) headers['x-request-id'] = requestId;

  return new Request('http://localhost/api/pagamento/webhook', { method: 'POST', headers, body: corpo });
}

async function criarUsuario(plan: 'gratuito' | 'pro' = 'gratuito'): Promise<string> {
  const id = randomUUID();
  await mutate((data) => {
    data.users.push({
      id,
      email: `${id}@exemplo.test`,
      name: 'Comprador de Teste',
      plan,
      passwordHash: 'nao-usado-neste-teste',
      createdAt: new Date().toISOString(),
    });
  });
  return id;
}

async function planoDe(ownerId: string): Promise<'gratuito' | 'pro' | undefined> {
  return lerBanco((data) => data.users.find((u) => u.id === ownerId)?.plan);
}

async function forcarPlano(ownerId: string, plan: 'gratuito' | 'pro'): Promise<void> {
  await mutate((data) => {
    const usuario = data.users.find((u) => u.id === ownerId);
    if (usuario) usuario.plan = plan;
  });
}

const PRECO = 2790;

// --- 1. Notificação repetida -------------------------------------------

describe('webhook — a mesma notificação chegando de novo não duplica nada', () => {
  it('aprovado 2x e 3x seguidas: o plano vira pro uma vez, e a segunda entrega não reprocessa', async () => {
    const ownerId = await criarUsuario('gratuito');
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: PRECO });
    const dataId = 'pagamento-idempotencia-1';

    mockarFetchPayment({
      status: 'approved',
      external_reference: pagamento.id,
      transaction_amount: PRECO / 100,
      currency_id: 'BRL',
    });

    const r1 = await POST(notificacao(dataId, { requestId: 'req-a' }));
    assert.equal(r1.status, 200);
    assert.deepEqual(await r1.json(), { ok: true, status: 'pago' });
    assert.equal(await planoDe(ownerId), 'pro');

    const depoisDaPrimeira = await buscarPagamento(pagamento.id);
    assert.equal(depoisDaPrimeira?.status, 'pago');

    /**
     * A prova de que a SEGUNDA entrega não reprocessa: rebaixa o plano por
     * fora (simula que algo mudou o estado entre as duas entregas) e reenvia
     * a MESMA notificação. Se a rota chamasse `definirPlano('pro')` de novo,
     * o plano voltaria a `pro` sozinho. Se ela for idempotente de verdade —
     * porque `podeTransicionar('pago', 'pago')` é falso — o plano continua
     * como foi deixado, e é isso que o teste teria que pegar.
     */
    await forcarPlano(ownerId, 'gratuito');

    const r2 = await POST(notificacao(dataId, { requestId: 'req-a' }));
    assert.equal(r2.status, 200);
    assert.deepEqual(await r2.json(), { ok: true, ignorado: 'sem mudança' });
    assert.equal(
      await planoDe(ownerId),
      'gratuito',
      'a segunda entrega da mesma notificação reprocessou e religou o plano — não é idempotente'
    );

    const r3 = await POST(notificacao(dataId, { requestId: 'req-a' }));
    assert.deepEqual(await r3.json(), { ok: true, ignorado: 'sem mudança' });
    assert.equal(await planoDe(ownerId), 'gratuito', 'a terceira entrega também reprocessou');

    // E não brotou uma segunda linha de pagamento pela mesma compra.
    const linhas = await listarPagamentos(ownerId);
    assert.equal(linhas.length, 1, 'a notificação repetida criou uma segunda linha de pagamento');

    const depoisDasRepeticoes = await buscarPagamento(pagamento.id);
    assert.equal(
      depoisDasRepeticoes?.updatedAt,
      depoisDaPrimeira?.updatedAt,
      'a linha do pagamento foi escrita de novo numa notificação repetida'
    );
  });
});

// --- 2. Fora de ordem -----------------------------------------------------

describe('webhook — notificação fora de ordem não rebaixa quem já pagou', () => {
  it('o "pendente" chegando depois do "aprovado" não tira o acesso', async () => {
    const ownerId = await criarUsuario('gratuito');
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: PRECO });

    mockarFetchPayment({ status: 'approved', external_reference: pagamento.id, transaction_amount: PRECO / 100, currency_id: 'BRL' });
    await POST(notificacao('mp-aprovado', { requestId: 'req-aprovado' }));
    assert.equal(await planoDe(ownerId), 'pro');
    const pago = await buscarPagamento(pagamento.id);

    // Agora a notificação atrasada do "pendente" (PIX que já tinha sido
    // criado antes de compensar, por exemplo) chega DEPOIS da aprovação.
    mockarFetchPayment({ status: 'pending', external_reference: pagamento.id, transaction_amount: PRECO / 100, currency_id: 'BRL' });
    const resposta = await POST(notificacao('mp-pendente-atrasado', { requestId: 'req-pendente' }));

    assert.deepEqual(await resposta.json(), { ok: true, ignorado: 'sem mudança' });
    assert.equal(await planoDe(ownerId), 'pro', 'a notificação atrasada de pendente tirou o acesso de quem pagou');

    const depois = await buscarPagamento(pagamento.id);
    assert.equal(depois?.status, 'pago');
    assert.equal(depois?.updatedAt, pago?.updatedAt, 'a notificação atrasada escreveu na linha do pagamento');
  });
});

// --- 3. Estorno -------------------------------------------------------

describe('webhook — estorno depois de pago devolve o plano gratuito', () => {
  it('refunded rebaixa quem tinha acesso pro', async () => {
    const ownerId = await criarUsuario('gratuito');
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: PRECO });

    mockarFetchPayment({ status: 'approved', external_reference: pagamento.id, transaction_amount: PRECO / 100, currency_id: 'BRL' });
    await POST(notificacao('mp-vai-estornar', { requestId: 'req-1' }));
    assert.equal(await planoDe(ownerId), 'pro');

    mockarFetchPayment({ status: 'refunded', external_reference: pagamento.id, transaction_amount: PRECO / 100, currency_id: 'BRL' });
    const resposta = await POST(notificacao('mp-estorno', { requestId: 'req-2' }));

    assert.deepEqual(await resposta.json(), { ok: true, status: 'estornado' });
    assert.equal(await planoDe(ownerId), 'gratuito');
    assert.equal((await buscarPagamento(pagamento.id))?.status, 'estornado');
  });

  it('estornado é definitivo: uma "aprovação" mandada depois não devolve o acesso', async () => {
    // O caminho de fraude óbvio: pedir o dinheiro de volta e, em seguida,
    // tentar fazer o sistema aceitar uma notificação de aprovação de novo.
    const ownerId = await criarUsuario('gratuito');
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: PRECO });

    mockarFetchPayment({ status: 'approved', external_reference: pagamento.id, transaction_amount: PRECO / 100, currency_id: 'BRL' });
    await POST(notificacao('mp-fraude-1', { requestId: 'req-1' }));

    mockarFetchPayment({ status: 'refunded', external_reference: pagamento.id, transaction_amount: PRECO / 100, currency_id: 'BRL' });
    await POST(notificacao('mp-fraude-2', { requestId: 'req-2' }));
    assert.equal(await planoDe(ownerId), 'gratuito');

    mockarFetchPayment({ status: 'approved', external_reference: pagamento.id, transaction_amount: PRECO / 100, currency_id: 'BRL' });
    const resposta = await POST(notificacao('mp-fraude-3', { requestId: 'req-3' }));

    assert.deepEqual(await resposta.json(), { ok: true, ignorado: 'sem mudança' });
    assert.equal(await planoDe(ownerId), 'gratuito', 'uma aprovação pós-estorno religou o plano pago');
    assert.equal((await buscarPagamento(pagamento.id))?.status, 'estornado');
  });
});

// --- 4. Referência desconhecida -----------------------------------------

describe('webhook — referência que não é nossa', () => {
  it('é recusada sem criar linha nenhuma', async () => {
    const refFantasma = randomUUID();
    mockarFetchPayment({ status: 'approved', external_reference: refFantasma, transaction_amount: PRECO / 100, currency_id: 'BRL' });

    const resposta = await POST(notificacao('mp-referencia-desconhecida', { requestId: 'req-1' }));

    assert.equal(resposta.status, 200);
    assert.deepEqual(await resposta.json(), { ok: true, ignorado: 'referência desconhecida' });
    assert.equal(await buscarPagamento(refFantasma), null, 'a rota criou uma linha para uma referência que não existia');
  });

  it('a notificação sem external_reference nenhum também é recusada', async () => {
    mockarFetchPayment({ status: 'approved', external_reference: null, transaction_amount: PRECO / 100, currency_id: 'BRL' });

    const resposta = await POST(notificacao('mp-sem-referencia', { requestId: 'req-1' }));

    assert.deepEqual(await resposta.json(), { ok: true, ignorado: 'sem referência' });
  });
});

// --- 5. Valor pago menor que o cobrado -----------------------------------

describe('webhook — valor pago menor que o cobrado', () => {
  it('não libera o plano, e o pagamento continua pendente para uma notificação futura corrigir', async () => {
    const ownerId = await criarUsuario('gratuito');
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: PRECO });

    // R$ 1,00 pago contra R$ 27,90 cobrados — o golpe do centavo.
    mockarFetchPayment({ status: 'approved', external_reference: pagamento.id, transaction_amount: 1, currency_id: 'BRL' });
    const resposta = await POST(notificacao('mp-valor-insuficiente', { requestId: 'req-1' }));

    assert.deepEqual(await resposta.json(), { ok: true, ignorado: 'valor insuficiente' });
    assert.equal(await planoDe(ownerId), 'gratuito');
    assert.equal((await buscarPagamento(pagamento.id))?.status, 'pendente');
  });

  it('valor pago maior que o cobrado NÃO é recusado — só o piso importa, não o teto', async () => {
    const ownerId = await criarUsuario('gratuito');
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: PRECO });

    mockarFetchPayment({ status: 'approved', external_reference: pagamento.id, transaction_amount: PRECO / 100 + 10, currency_id: 'BRL' });
    const resposta = await POST(notificacao('mp-valor-maior', { requestId: 'req-1' }));

    assert.deepEqual(await resposta.json(), { ok: true, status: 'pago' });
    assert.equal(await planoDe(ownerId), 'pro');
  });
});

// --- 5 (continuação). Valor que não pôde ser lido -----------------------

describe('webhook — "pago" cujo valor não pôde ser lido da resposta do provedor', () => {
  it('transaction_amount ausente: NÃO libera o plano, e a resposta é 500 (fail-closed, pede reenvio)', async () => {
    const ownerId = await criarUsuario('gratuito');
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: PRECO });

    // A resposta do provedor simplesmente não trouxe o campo — o cenário que
    // fazia `amountCents` virar `null` e a checagem de valor ser pulada
    // inteira antes desta correção.
    const respostaSemValor = { status: 'approved', external_reference: pagamento.id } as unknown as RespostaProvedor;
    mockarFetchPayment(respostaSemValor);

    const resposta = await POST(notificacao('mp-valor-ausente', { requestId: 'req-1' }));

    assert.equal(resposta.status, 500, 'valor ilegível não pode responder 200 — o provedor precisa reenviar');
    assert.equal(await planoDe(ownerId), 'gratuito', 'o plano foi liberado sem nenhum valor para conferir');
    assert.equal(
      (await buscarPagamento(pagamento.id))?.status,
      'pendente',
      'o pagamento avançou de status sem o valor ter sido conferido'
    );
  });

  it('transaction_amount não-numérico (string): mesmo desfecho de valor ausente', async () => {
    const ownerId = await criarUsuario('gratuito');
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: PRECO });

    const respostaValorTexto = {
      status: 'approved',
      external_reference: pagamento.id,
      transaction_amount: '27.9',
    } as unknown as RespostaProvedor;
    mockarFetchPayment(respostaValorTexto);

    const resposta = await POST(notificacao('mp-valor-string', { requestId: 'req-1' }));

    assert.equal(resposta.status, 500);
    assert.equal(await planoDe(ownerId), 'gratuito');
    assert.equal((await buscarPagamento(pagamento.id))?.status, 'pendente');
  });

  it('transaction_amount null explícito: mesmo desfecho', async () => {
    const ownerId = await criarUsuario('gratuito');
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: PRECO });

    mockarFetchPayment({ status: 'approved', external_reference: pagamento.id, transaction_amount: null, currency_id: 'BRL' });

    const resposta = await POST(notificacao('mp-valor-null', { requestId: 'req-1' }));

    assert.equal(resposta.status, 500);
    assert.equal(await planoDe(ownerId), 'gratuito');
  });

  it('o caso normal — valor presente e suficiente — continua liberando o plano', async () => {
    const ownerId = await criarUsuario('gratuito');
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: PRECO });

    mockarFetchPayment({ status: 'approved', external_reference: pagamento.id, transaction_amount: PRECO / 100, currency_id: 'BRL' });

    const resposta = await POST(notificacao('mp-valor-presente-ok', { requestId: 'req-1' }));

    assert.deepEqual(await resposta.json(), { ok: true, status: 'pago' });
    assert.equal(await planoDe(ownerId), 'pro');
  });
});

// --- 5 (continuação). Moeda que não confere -------------------------------

describe('webhook — "pago" cuja moeda não confere com a do nosso registro', () => {
  it('moeda diferente da nossa (mesmo número de centavos): NÃO libera o plano, resposta 500', async () => {
    const ownerId = await criarUsuario('gratuito');
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: PRECO });

    // O mesmo "27.9" que bateria em reais, só que cobrado em outra moeda — o
    // golpe do centavo pela moeda em vez da quantia: o número passa, o
    // dinheiro que efetivamente entrou é uma fração dele.
    mockarFetchPayment({
      status: 'approved',
      external_reference: pagamento.id,
      transaction_amount: PRECO / 100,
      currency_id: 'USD',
    });

    const resposta = await POST(notificacao('mp-moeda-diferente', { requestId: 'req-1' }));

    assert.equal(resposta.status, 500, 'moeda divergente não pode responder 200 — o provedor precisa reenviar');
    assert.equal(await planoDe(ownerId), 'gratuito', 'o plano foi liberado com a moeda errada');
    assert.equal(
      (await buscarPagamento(pagamento.id))?.status,
      'pendente',
      'o pagamento avançou de status sem a moeda ter sido conferida'
    );
  });

  it('moeda ausente na resposta do provedor: mesmo desfecho de moeda divergente', async () => {
    const ownerId = await criarUsuario('gratuito');
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: PRECO });

    const respostaSemMoeda = {
      status: 'approved',
      external_reference: pagamento.id,
      transaction_amount: PRECO / 100,
    } as unknown as RespostaProvedor;
    mockarFetchPayment(respostaSemMoeda);

    const resposta = await POST(notificacao('mp-moeda-ausente', { requestId: 'req-1' }));

    assert.equal(resposta.status, 500);
    assert.equal(await planoDe(ownerId), 'gratuito');
    assert.equal((await buscarPagamento(pagamento.id))?.status, 'pendente');
  });

  it('moeda igual à nossa e valor suficiente: continua liberando o plano', async () => {
    const ownerId = await criarUsuario('gratuito');
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: PRECO });

    mockarFetchPayment({
      status: 'approved',
      external_reference: pagamento.id,
      transaction_amount: PRECO / 100,
      currency_id: 'BRL',
    });

    const resposta = await POST(notificacao('mp-moeda-igual-ok', { requestId: 'req-1' }));

    assert.deepEqual(await resposta.json(), { ok: true, status: 'pago' });
    assert.equal(await planoDe(ownerId), 'pro');
  });
});

// --- 3 (continuação). Nenhum status além de "pago" libera o plano --------

describe('webhook — só "pago" libera o plano', () => {
  it('recusado não libera', async () => {
    const ownerId = await criarUsuario('gratuito');
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: PRECO });

    mockarFetchPayment({ status: 'rejected', external_reference: pagamento.id, transaction_amount: PRECO / 100, currency_id: 'BRL' });
    const resposta = await POST(notificacao('mp-recusado', { requestId: 'req-1' }));

    assert.deepEqual(await resposta.json(), { ok: true, status: 'recusado' });
    assert.equal(await planoDe(ownerId), 'gratuito');
  });

  it('cancelado não libera', async () => {
    const ownerId = await criarUsuario('gratuito');
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: PRECO });

    mockarFetchPayment({ status: 'cancelled', external_reference: pagamento.id, transaction_amount: PRECO / 100, currency_id: 'BRL' });
    const resposta = await POST(notificacao('mp-cancelado', { requestId: 'req-1' }));

    assert.deepEqual(await resposta.json(), { ok: true, status: 'cancelado' });
    assert.equal(await planoDe(ownerId), 'gratuito');
  });

  it('pendente não libera', async () => {
    const ownerId = await criarUsuario('gratuito');
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: PRECO });

    // A linha já nasce "pendente" (ver criarPagamento). Notificar "pending" é
    // o mesmo status chegando — não é transição nenhuma, e é exatamente o
    // ponto: nem essa notificação libera o plano.
    mockarFetchPayment({ status: 'pending', external_reference: pagamento.id, transaction_amount: PRECO / 100, currency_id: 'BRL' });
    const resposta = await POST(notificacao('mp-pendente', { requestId: 'req-1' }));

    assert.deepEqual(await resposta.json(), { ok: true, ignorado: 'sem mudança' });
    assert.equal(await planoDe(ownerId), 'gratuito');
    assert.equal((await buscarPagamento(pagamento.id))?.status, 'pendente');
  });

  it('recusado no cartão pode virar pago na segunda tentativa, e SÓ AÍ libera', async () => {
    const ownerId = await criarUsuario('gratuito');
    const pagamento = await criarPagamento({ ownerId, provider: 'mercadopago', amountCents: PRECO });

    mockarFetchPayment({ status: 'rejected', external_reference: pagamento.id, transaction_amount: PRECO / 100, currency_id: 'BRL' });
    await POST(notificacao('mp-tentativa-1', { requestId: 'req-1' }));
    assert.equal(await planoDe(ownerId), 'gratuito');

    mockarFetchPayment({ status: 'approved', external_reference: pagamento.id, transaction_amount: PRECO / 100, currency_id: 'BRL' });
    await POST(notificacao('mp-tentativa-2', { requestId: 'req-2' }));
    assert.equal(await planoDe(ownerId), 'pro');
  });
});

// --- Guarda-chuva: assinatura, tipo e configuração ------------------------

describe('webhook — o que precisa ser recusado antes de tocar em qualquer pagamento', () => {
  it('assinatura inválida: 401, e a API do provedor nunca é chamada', async () => {
    mockarFetchPayment('nao-deve-ser-chamado');
    const resposta = await POST(notificacao('mp-assinatura-errada', { segredo: 'segredo-do-atacante' }));

    assert.equal(resposta.status, 401);
    assert.equal(ultimaChamadaDeRede, null);
  });

  it('sem cabeçalho de assinatura: 401', async () => {
    const req = new Request('http://localhost/api/pagamento/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'payment', data: { id: 'mp-sem-assinatura' } }),
    });
    const resposta = await POST(req);
    assert.equal(resposta.status, 401);
  });

  it('tipo diferente de "payment" é ignorado sem tocar no provedor nem no banco', async () => {
    mockarFetchPayment('nao-deve-ser-chamado');
    const dataId = 'evento-que-nao-e-pagamento';
    const ts = Math.floor(Date.now() / 1000);
    const corpo = JSON.stringify({ type: 'merchant_order', data: { id: dataId } });
    const req = new Request('http://localhost/api/pagamento/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-signature': assinar(dataId, 'req-1', ts),
        'x-request-id': 'req-1',
      },
      body: corpo,
    });

    const resposta = await POST(req);
    assert.equal(resposta.status, 200);
    assert.equal((await resposta.json()).ignorado, 'merchant_order');
    assert.equal(ultimaChamadaDeRede, null);
  });

  it('corpo que não é JSON: 400', async () => {
    const req = new Request('http://localhost/api/pagamento/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ isso não é json',
    });
    const resposta = await POST(req);
    assert.equal(resposta.status, 400);
  });

  it('corpo maior que 64KB: 413, sem tentar entender o conteúdo', async () => {
    const req = new Request('http://localhost/api/pagamento/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(64 * 1024 + 1),
    });
    const resposta = await POST(req);
    assert.equal(resposta.status, 413);
  });

  it('sem MERCADOPAGO_WEBHOOK_SECRET configurado: 503, nada é processado', async () => {
    const original = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    try {
      const resposta = await POST(notificacao('mp-sem-segredo'));
      assert.equal(resposta.status, 503);
    } finally {
      process.env.MERCADOPAGO_WEBHOOK_SECRET = original;
    }
  });
});
