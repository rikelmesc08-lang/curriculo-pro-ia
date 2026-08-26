import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { liberaPlano, traduzirStatus } from './mercadopago-status';

/**
 * Classificar errado aqui custa dinheiro nos dois sentidos: chamar `approved`
 * de pendente segura o acesso de quem pagou; chamar `in_process` de pago
 * entrega o produto antes de o dinheiro existir.
 */

describe('traduzirStatus', () => {
  it('só approved é pago', () => {
    assert.equal(traduzirStatus('approved'), 'pago');
  });

  it('o que ainda pode virar pago fica pendente', () => {
    for (const bruto of ['pending', 'in_process', 'in_mediation']) {
      assert.equal(traduzirStatus(bruto), 'pendente', bruto);
    }
  });

  it('authorized é pendente: valor reservado no cartão não é dinheiro nosso', () => {
    // Cartão autorizado e NÃO capturado. Tratar como pago entregaria o produto
    // contra uma reserva que pode nunca ser cobrada.
    assert.equal(traduzirStatus('authorized'), 'pendente');
  });

  it('rejected e cancelled não são a mesma coisa, e nenhum é pago', () => {
    assert.equal(traduzirStatus('rejected'), 'recusado');
    assert.equal(traduzirStatus('cancelled'), 'cancelado');
  });

  it('refunded e charged_back são estorno', () => {
    assert.equal(traduzirStatus('refunded'), 'estornado');
    assert.equal(traduzirStatus('charged_back'), 'estornado');
  });

  it('status desconhecido cai em pendente, nunca em pago', () => {
    // Um status novo que o provedor inventar depois desta linha ser escrita não
    // pode virar acesso liberado por acidente. E também não pode virar recusa,
    // que tiraria o acesso de alguém por causa de uma palavra nova.
    for (const bruto of ['status_novo_do_provedor', '', 'APPROVED_PARCIAL', 'unknown']) {
      assert.equal(traduzirStatus(bruto), 'pendente', bruto);
    }
  });

  it('não estoura com valor que não é string', () => {
    for (const bruto of [null, undefined, 42, {}, []]) {
      assert.equal(traduzirStatus(bruto), 'pendente');
    }
  });

  it('tolera caixa e espaço, que já vieram assim de provedor', () => {
    assert.equal(traduzirStatus(' Approved '), 'pago');
  });
});

describe('liberaPlano', () => {
  it('só pago libera', () => {
    assert.equal(liberaPlano('pago'), true);
  });

  it('nenhum outro libera', () => {
    for (const status of ['pendente', 'recusado', 'cancelado', 'estornado'] as const) {
      assert.equal(liberaPlano(status), false, status);
    }
  });
});
