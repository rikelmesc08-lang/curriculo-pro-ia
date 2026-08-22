import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';

/**
 * Tokens de recuperação de senha.
 *
 * É a peça que dá acesso a uma conta sem senha. Cada regra abaixo, se falhar,
 * falha em silêncio — nenhuma delas aparece na tela, e todas viram invasão:
 * token que não expira, token reutilizável, token que sobrevive a um novo
 * pedido, ou o token gravado em texto no banco.
 */

const dataDir = mkdtempSync(join(tmpdir(), 'cpro-reset-'));
process.env.LOCAL_DATA_DIR = dataDir;
process.env.DB_DRIVER = 'local';

import { createLocalUser, authenticateLocalUser } from './local';
import { consumeLocalPasswordReset, createLocalPasswordReset } from './reset';
import { read, mutate } from '@/lib/db/local/store';

const EMAIL = 'pessoa@exemplo.test';
const SENHA_ANTIGA = 'senha-antiga-123';
const SENHA_NOVA = 'senha-nova-456';

beforeEach(async () => {
  await mutate((db) => {
    db.users = [];
    db.passwordResets = [];
  });
  await createLocalUser({ name: 'Pessoa', email: EMAIL, password: SENHA_ANTIGA });
});

after(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.LOCAL_DATA_DIR;
  delete process.env.DB_DRIVER;
});

describe('createLocalPasswordReset', () => {
  it('emite token para e-mail cadastrado', async () => {
    const token = await createLocalPasswordReset(EMAIL);
    assert.ok(token && token.length > 20);
  });

  it('devolve null para e-mail que não existe', async () => {
    // Quem chama responde a mesma coisa nos dois casos. Se esta função lançasse
    // ou devolvesse algo diferente, o tempo ou a mensagem entregariam quem tem
    // conta aqui.
    assert.equal(await createLocalPasswordReset('ninguem@exemplo.test'), null);
  });

  it('não grava o token em texto, só o hash', async () => {
    const token = await createLocalPasswordReset(EMAIL);
    const gravados = await read((db) => db.passwordResets);

    assert.equal(gravados.length, 1);
    assert.notEqual(gravados[0].tokenHash, token);
    assert.match(gravados[0].tokenHash, /^[0-9a-f]{64}$/);

    const banco = JSON.stringify(gravados);
    assert.ok(!banco.includes(token!), 'o token apareceu em texto no banco');
  });

  it('aceita e-mail com caixa e espaço diferentes', async () => {
    assert.ok(await createLocalPasswordReset(`  ${EMAIL.toUpperCase()}  `));
  });

  it('invalida o link anterior quando um novo é pedido', async () => {
    const primeiro = await createLocalPasswordReset(EMAIL);
    const segundo = await createLocalPasswordReset(EMAIL);

    // Sem isto, cada pedido deixaria mais uma chave válida circulando na caixa
    // de entrada da pessoa.
    const antigo = await consumeLocalPasswordReset(primeiro!, SENHA_NOVA);
    assert.deepEqual(antigo, { ok: false, reason: 'invalido' });

    const novo = await consumeLocalPasswordReset(segundo!, SENHA_NOVA);
    assert.equal(novo.ok, true);
  });
});

describe('consumeLocalPasswordReset', () => {
  it('troca a senha e o login passa a aceitar a nova', async () => {
    const token = await createLocalPasswordReset(EMAIL);
    const resultado = await consumeLocalPasswordReset(token!, SENHA_NOVA);
    assert.equal(resultado.ok, true);

    const comNova = await authenticateLocalUser({ email: EMAIL, password: SENHA_NOVA });
    assert.equal(comNova.ok, true);
  });

  it('invalida a senha antiga', async () => {
    const token = await createLocalPasswordReset(EMAIL);
    await consumeLocalPasswordReset(token!, SENHA_NOVA);

    const comAntiga = await authenticateLocalUser({ email: EMAIL, password: SENHA_ANTIGA });
    assert.equal(comAntiga.ok, false);
  });

  it('recusa o mesmo token na segunda vez', async () => {
    const token = await createLocalPasswordReset(EMAIL);
    await consumeLocalPasswordReset(token!, SENHA_NOVA);

    const segunda = await consumeLocalPasswordReset(token!, 'terceira-senha-789');
    assert.deepEqual(segunda, { ok: false, reason: 'usado' });

    // E a senha continua sendo a da primeira troca.
    const login = await authenticateLocalUser({ email: EMAIL, password: SENHA_NOVA });
    assert.equal(login.ok, true);
  });

  it('recusa token expirado', async () => {
    const token = await createLocalPasswordReset(EMAIL);
    await mutate((db) => {
      db.passwordResets[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    });

    assert.deepEqual(await consumeLocalPasswordReset(token!, SENHA_NOVA), {
      ok: false,
      reason: 'expirado',
    });

    const login = await authenticateLocalUser({ email: EMAIL, password: SENHA_ANTIGA });
    assert.equal(login.ok, true, 'a senha antiga deveria continuar valendo');
  });

  it('recusa token inventado', async () => {
    await createLocalPasswordReset(EMAIL);
    assert.deepEqual(await consumeLocalPasswordReset('token-que-nunca-existiu', SENHA_NOVA), {
      ok: false,
      reason: 'invalido',
    });
  });

  it('recusa token vazio sem tocar no banco', async () => {
    await createLocalPasswordReset(EMAIL);
    assert.deepEqual(await consumeLocalPasswordReset('', SENHA_NOVA), {
      ok: false,
      reason: 'invalido',
    });
    const login = await authenticateLocalUser({ email: EMAIL, password: SENHA_ANTIGA });
    assert.equal(login.ok, true);
  });

  it('recusa quando a conta foi apagada depois de o link ser emitido', async () => {
    const token = await createLocalPasswordReset(EMAIL);
    await mutate((db) => {
      db.users = [];
    });

    assert.deepEqual(await consumeLocalPasswordReset(token!, SENHA_NOVA), {
      ok: false,
      reason: 'invalido',
    });
  });

  it('o token de uma conta não serve para outra', async () => {
    await createLocalUser({ name: 'Outra', email: 'outra@exemplo.test', password: 'outra-senha-1' });
    const tokenDaOutra = await createLocalPasswordReset('outra@exemplo.test');

    await consumeLocalPasswordReset(tokenDaOutra!, SENHA_NOVA);

    // A primeira conta não pode ter sido afetada.
    const primeira = await authenticateLocalUser({ email: EMAIL, password: SENHA_ANTIGA });
    assert.equal(primeira.ok, true, 'o token de uma conta trocou a senha de outra');
  });
});
