import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPassword, precisaRehash, verifyPassword } from './password';

/**
 * Armazenamento de senha.
 *
 * Nada aqui aparece na tela, e todo defeito é silencioso: hash em texto, custo
 * fraco, ou — o pior nesta mudança — parâmetros novos que invalidam as senhas já
 * gravadas e trancam todo mundo para fora sem nenhuma mensagem explicando.
 */

const SENHA = 'uma-senha-de-teste-123';

/** Formato antigo, sem parâmetros: `scrypt$sal$hash` com os padrões do Node. */
async function hashLegado(senha: string): Promise<string> {
  const { randomBytes, scrypt } = await import('node:crypto');
  const { promisify } = await import('node:util');
  const derivar = promisify(scrypt) as (s: string, salt: Buffer, len: number) => Promise<Buffer>;
  const salt = randomBytes(16);
  const derivado = await derivar(senha, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derivado.toString('hex')}`;
}

describe('hashPassword', () => {
  it('nunca guarda a senha em texto', async () => {
    const hash = await hashPassword(SENHA);
    assert.ok(!hash.includes(SENHA));
  });

  it('registra os parâmetros de custo junto do hash', async () => {
    // É o que permite endurecer o custo depois sem invalidar o que já existe.
    const hash = await hashPassword(SENHA);
    const partes = hash.split('$');
    assert.equal(partes.length, 6);
    assert.equal(partes[0], 'scrypt');
    assert.ok(Number(partes[1]) >= 65536, 'custo de CPU/memória abaixo do recomendado');
  });

  it('gera hash diferente para a mesma senha (sal por usuário)', async () => {
    assert.notEqual(await hashPassword(SENHA), await hashPassword(SENHA));
  });

  it('aceita a senha certa e recusa a errada', async () => {
    const hash = await hashPassword(SENHA);
    assert.equal(await verifyPassword(SENHA, hash), true);
    assert.equal(await verifyPassword(SENHA + 'x', hash), false);
    assert.equal(await verifyPassword('', hash), false);
  });
});

describe('compatibilidade com hashes já gravados', () => {
  it('continua aceitando o formato antigo', async () => {
    // O TESTE MAIS IMPORTANTE DESTE ARQUIVO: se ele falhar, subir os parâmetros
    // significa que ninguém cadastrado antes consegue entrar de novo.
    const antigo = await hashLegado(SENHA);
    assert.equal(await verifyPassword(SENHA, antigo), true);
    assert.equal(await verifyPassword('outra-senha', antigo), false);
  });

  it('marca o formato antigo para regravação', async () => {
    assert.equal(precisaRehash(await hashLegado(SENHA)), true);
  });

  it('não marca para regravação o que já está no custo atual', async () => {
    assert.equal(precisaRehash(await hashPassword(SENHA)), false);
  });
});

describe('registro adulterado', () => {
  it('recusa formato desconhecido em vez de lançar', async () => {
    for (const lixo of ['', 'nao-e-hash', 'bcrypt$a$b', 'scrypt$', 'scrypt$1$2', '$$$$$']) {
      assert.equal(await verifyPassword(SENHA, lixo), false, `aceitou: ${lixo}`);
    }
  });

  it('recusa custo absurdo em vez de tentar derivar', async () => {
    // Um registro adulterado com N gigantesco viraria negação de serviço por
    // memória a cada tentativa de login.
    const venenoso = `scrypt$1073741824$8$1$${'ab'.repeat(16)}$${'cd'.repeat(32)}`;
    assert.equal(await verifyPassword(SENHA, venenoso), false);
  });

  it('recusa hash com comprimento errado', async () => {
    const curto = `scrypt$65536$8$2$${'ab'.repeat(16)}$${'cd'.repeat(4)}`;
    assert.equal(await verifyPassword(SENHA, curto), false);
  });
});
