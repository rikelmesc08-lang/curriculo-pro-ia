import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

/**
 * Troca de senha do driver local — sem reautenticação era um jeito de
 * trancar o dono para fora.
 *
 * O DEFEITO ORIGINAL: `changeLocalPassword(userId, novaSenha)` trocava a
 * senha só com o `userId` da sessão, sem conferir a senha ATUAL. Quem
 * obtivesse a sessão (dispositivo destravado, cookie roubado) trocava a
 * senha sem saber a antiga — e o dono ficava de fora. Depois da troca,
 * nenhuma outra sessão do usuário era encerrada: um invasor que já tivesse
 * uma sessão aberta continuava com acesso mesmo depois do dono "recuperar"
 * a conta trocando a senha.
 *
 * `env.localDataDir()` é lido dentro de cada `read`/`mutate`
 * (`src/lib/db/local/store.ts`), não no import — por isso a variável de
 * ambiente é ajustada ANTES de qualquer chamada, e o import em si pode ficar
 * no topo do arquivo sem problema de ordem.
 */

const dataDir = mkdtempSync(join(tmpdir(), 'cpro-troca-senha-'));
process.env.LOCAL_DATA_DIR = dataDir;

import {
  authenticateLocalUser,
  changeLocalPassword,
  createLocalUser,
  getLocalSessionVersion,
} from './local';

after(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.LOCAL_DATA_DIR;
});

async function novoUsuario(email: string, senha: string) {
  const resultado = await createLocalUser({ name: 'Teste', email, password: senha });
  assert.ok(resultado.ok, 'falha ao criar usuário de teste');
  return resultado.ok ? resultado.user : never();
}

function never(): never {
  throw new Error('inalcançável');
}

describe('troca de senha exige a senha ATUAL', () => {
  it('recusa a troca quando a senha atual está errada — O TESTE QUE FALHAVA ANTES DESTA CORREÇÃO', async () => {
    const usuario = await novoUsuario('recusa@exemplo.test', 'senha-original-123');

    const resultado = await changeLocalPassword(usuario.id, 'senha-adivinhada-errada', 'senha-nova-123');
    assert.equal(resultado.ok, false);
    assert.equal(!resultado.ok && resultado.reason, 'senha-atual-incorreta');

    // A senha original continua sendo a que autentica.
    const loginComOriginal = await authenticateLocalUser({
      email: 'recusa@exemplo.test',
      password: 'senha-original-123',
    });
    assert.equal(loginComOriginal.ok, true);
  });

  it('troca a senha quando a senha atual está certa', async () => {
    const usuario = await novoUsuario('aceita@exemplo.test', 'senha-original-123');

    const resultado = await changeLocalPassword(usuario.id, 'senha-original-123', 'senha-nova-456');
    assert.equal(resultado.ok, true);

    const loginComNova = await authenticateLocalUser({
      email: 'aceita@exemplo.test',
      password: 'senha-nova-456',
    });
    assert.equal(loginComNova.ok, true);

    const loginComAntiga = await authenticateLocalUser({
      email: 'aceita@exemplo.test',
      password: 'senha-original-123',
    });
    assert.equal(loginComAntiga.ok, false, 'a senha antiga continuou funcionando depois da troca');
  });

  it('recusa usuário inexistente sem lançar', async () => {
    const resultado = await changeLocalPassword('conta-que-nao-existe', 'qualquer', 'nova-senha-123');
    assert.equal(resultado.ok, false);
    assert.equal(!resultado.ok && resultado.reason, 'usuario-nao-encontrado');
  });
});

describe('troca de senha derruba os OUTROS dispositivos', () => {
  it('incrementa a versão de sessão a cada troca bem-sucedida', async () => {
    const usuario = await novoUsuario('versao@exemplo.test', 'senha-original-123');
    assert.equal(await getLocalSessionVersion(usuario.id), 0);

    const primeira = await changeLocalPassword(usuario.id, 'senha-original-123', 'senha-nova-1');
    assert.ok(primeira.ok);
    assert.equal(primeira.ok && primeira.sessionVersion, 1);
    assert.equal(await getLocalSessionVersion(usuario.id), 1);

    const segunda = await changeLocalPassword(usuario.id, 'senha-nova-1', 'senha-nova-2');
    assert.ok(segunda.ok);
    assert.equal(segunda.ok && segunda.sessionVersion, 2);
    assert.equal(await getLocalSessionVersion(usuario.id), 2);
  });

  it('uma tentativa recusada (senha atual errada) NÃO incrementa a versão', async () => {
    const usuario = await novoUsuario('sem-incremento@exemplo.test', 'senha-original-123');
    assert.equal(await getLocalSessionVersion(usuario.id), 0);

    await changeLocalPassword(usuario.id, 'senha-errada', 'senha-nova-123');
    assert.equal(
      await getLocalSessionVersion(usuario.id),
      0,
      'uma tentativa que falhou não pode invalidar sessão nenhuma'
    );
  });

  it('devolve null para usuário que não existe (mais)', async () => {
    assert.equal(await getLocalSessionVersion('conta-que-nao-existe'), null);
  });
});

describe('migração de custo do hash no login não é uma troca de senha', () => {
  it('logar não incrementa a versão de sessão (rehash não deve derrubar outros dispositivos)', async () => {
    // A migração de custo (`precisaRehash`) roda dentro de
    // `authenticateLocalUser` sempre que o hash gravado usa parâmetros
    // antigos. Como todo usuário criado por `createLocalUser` já nasce no
    // custo atual, este teste cobre o contrato diretamente: logar várias
    // vezes seguidas nunca pode mexer na versão de sessão, que só a troca
    // de senha de verdade deve alterar.
    const usuario = await novoUsuario('rehash@exemplo.test', 'senha-original-123');

    await authenticateLocalUser({ email: 'rehash@exemplo.test', password: 'senha-original-123' });
    await authenticateLocalUser({ email: 'rehash@exemplo.test', password: 'senha-original-123' });

    assert.equal(await getLocalSessionVersion(usuario.id), 0);
  });
});
