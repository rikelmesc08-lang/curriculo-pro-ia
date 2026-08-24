import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { podeTransicionar, precoEmReais, type PaymentStatus } from './payment';

/**
 * NOTIFICAÇÃO DE PAGAMENTO CHEGA FORA DE ORDEM. Não é hipótese defensiva: é o
 * comportamento normal de qualquer provedor com retentativa. A do "pendente"
 * pode aterrissar depois da do "aprovado", e processada sem critério ela tira o
 * acesso de alguém que pagou.
 *
 * Estes testes fixam quais transições podem acontecer — e, principalmente,
 * quais não podem.
 */

describe('podeTransicionar — o caminho normal', () => {
  it('pendente vira pago', () => {
    assert.equal(podeTransicionar('pendente', 'pago'), true);
  });

  it('pendente vira recusado ou cancelado', () => {
    assert.equal(podeTransicionar('pendente', 'recusado'), true);
    assert.equal(podeTransicionar('pendente', 'cancelado'), true);
  });

  it('recusado ainda pode virar pago: cartão que passa na segunda tentativa', () => {
    assert.equal(podeTransicionar('recusado', 'pago'), true);
  });
});

describe('podeTransicionar — o que não pode acontecer', () => {
  it('pago NÃO volta para pendente', () => {
    // O caso real: a notificação do "pendente" chega atrasada, depois da do
    // "aprovado". Aceitar isso rebaixaria uma compra já paga.
    assert.equal(podeTransicionar('pago', 'pendente'), false);
  });

  it('pago NÃO vira recusado nem cancelado', () => {
    assert.equal(podeTransicionar('pago', 'recusado'), false);
    assert.equal(podeTransicionar('pago', 'cancelado'), false);
  });

  it('pago vira estornado, que é a única notícia posterior que importa', () => {
    assert.equal(podeTransicionar('pago', 'estornado'), true);
  });

  it('estornado é definitivo: nada o desfaz', () => {
    const todos: PaymentStatus[] = ['pendente', 'pago', 'recusado', 'cancelado', 'estornado'];
    for (const destino of todos) {
      assert.equal(
        podeTransicionar('estornado', destino),
        false,
        `estornado não pode virar ${destino}`
      );
    }
  });

  it('o mesmo status não é transição — é a mesma notificação chegando de novo', () => {
    const todos: PaymentStatus[] = ['pendente', 'pago', 'recusado', 'cancelado', 'estornado'];
    for (const status of todos) {
      assert.equal(podeTransicionar(status, status), false);
    }
  });
});

describe('precoEmReais', () => {
  it('formata centavos como moeda brasileira', () => {
    //   é o espaço não separável que o Intl usa entre "R$" e o número.
    assert.equal(precoEmReais(2790).replace(/ /g, ' '), 'R$ 27,90');
  });

  it('não perde centavo em valor redondo', () => {
    assert.equal(precoEmReais(10000).replace(/ /g, ' '), 'R$ 100,00');
  });
});
