import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { capInput, fingerprint, stableStringify } from './fingerprint';

/**
 * A impressão digital é o que faz o cache funcionar, e o cache é a primeira
 * barreira de custo. O modo de falha aqui é silencioso dos dois lados:
 *
 *   - hash instável demais: o cache nunca acerta, toda repetição vira chamada
 *     paga, e a única pista é a fatura;
 *   - hash instável de menos: duas perguntas diferentes colidem e a pessoa
 *     recebe a análise de outro currículo. Este é o pior dos dois.
 */

beforeEach(() => {
  process.env.AI_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'chave-de-teste';
});

afterEach(() => {
  delete process.env.AI_PROVIDER;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
});

describe('stableStringify', () => {
  it('ignora a ordem em que as chaves foram inseridas', () => {
    assert.equal(stableStringify({ a: 1, b: 2 }), stableStringify({ b: 2, a: 1 }));
  });

  it('ordena também em objetos aninhados', () => {
    assert.equal(
      stableStringify({ x: { p: 1, q: 2 }, y: [{ m: 1, n: 2 }] }),
      stableStringify({ y: [{ n: 2, m: 1 }], x: { q: 2, p: 1 } })
    );
  });

  it('preserva a ordem dos arrays, que é significativa', () => {
    assert.notEqual(stableStringify([1, 2]), stableStringify([2, 1]));
  });

  it('trata undefined como campo ausente', () => {
    assert.equal(stableStringify({ a: 1, b: undefined }), stableStringify({ a: 1 }));
  });
});

describe('fingerprint', () => {
  it('dá o mesmo hash para a mesma pergunta', () => {
    const entrada = { resume: { nome: 'Ana' }, job: 'vaga' };
    assert.equal(fingerprint('t', entrada), fingerprint('t', entrada));
  });

  it('ignora a ordem das chaves da entrada', () => {
    assert.equal(
      fingerprint('t', { resume: 'r', job: 'j' }),
      fingerprint('t', { job: 'j', resume: 'r' })
    );
  });

  it('separa tarefas diferentes sobre a mesma entrada', () => {
    const entrada = { resume: 'r' };
    assert.notEqual(fingerprint('analyzeAts', entrada), fingerprint('optimizeResume', entrada));
  });

  it('muda quando qualquer parte da entrada muda', () => {
    assert.notEqual(fingerprint('t', { job: 'vaga A' }), fingerprint('t', { job: 'vaga B' }));
  });

  it('invalida o cache ao trocar de modelo', () => {
    const entrada = { resume: 'r' };
    const comPadrao = fingerprint('t', entrada);
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    assert.notEqual(comPadrao, fingerprint('t', entrada));
  });

  it('invalida o cache ao trocar de provedor', () => {
    const entrada = { resume: 'r' };
    const comGemini = fingerprint('t', entrada);
    process.env.AI_PROVIDER = 'anthropic';
    assert.notEqual(comGemini, fingerprint('t', entrada));
  });

  it('devolve hexadecimal de 64 caracteres, sem nada do texto original', () => {
    const hash = fingerprint('t', { segredo: 'CPF-DA-PESSOA' });
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.ok(!hash.includes('CPF'));
  });
});

describe('capInput', () => {
  it('deixa passar texto dentro do limite', () => {
    assert.equal(capInput('curto', 100), 'curto');
  });

  it('corta o que passa do limite', () => {
    assert.equal(capInput('a'.repeat(50), 10).length, 10);
  });

  it('devolve string vazia para o que não é texto', () => {
    // A entrada vem do cliente numa Server Action: pode ser qualquer coisa.
    assert.equal(capInput(null), '');
    assert.equal(capInput(undefined), '');
    assert.equal(capInput({ malicioso: true }), '');
    assert.equal(capInput(12345), '');
  });
});
