import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';
import { createLocalSessionValue, readLocalSession, sessionCookie } from './session-cookie';

/**
 * Cookie de sessão do driver local.
 *
 * Este é o único lugar do produto que decide, sem tocar o banco, se um
 * visitante É quem o cookie diz que é. Se a verificação de assinatura tiver
 * um furo, qualquer pessoa edita o id no navegador e entra na conta de
 * outra; se a checagem de expiração tiver um furo, um cookie roubado nunca
 * vence. Os dois erros são silenciosos — nada quebra visivelmente, a conta
 * simplesmente fica aberta.
 *
 * `sessionVersion` viaja no cookie desde a troca de senha passar a exigir
 * invalidar os outros dispositivos (`changeLocalPassword`, em `./local`): o
 * número embutido aqui é conferido, na leitura da sessão
 * (`getSessionUser`, em `./session`), contra o valor gravado no usuário —
 * fora do escopo deste arquivo, que testa só a ida e volta do cookie em si.
 *
 * O teste importa de `./session-cookie`, não de `./session`: `session.ts`
 * importa `next/navigation` (para `requireUser`), que não carrega fora de
 * uma requisição real — nem sequer `require('next/navigation')` sozinho
 * funciona neste runner. `session-cookie.ts` é a mesma lógica, sem essa
 * dependência, reexportada por `session.ts` para quem consome em produção.
 */

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

afterEach(() => {
  restoreEnv();
});

/**
 * `NODE_ENV` é tipado como somente-leitura em `@types/node` (é normalmente
 * definido pela própria ferramenta, não pela aplicação). O teste precisa
 * alterná-lo para exercitar `env.isProduction()`; o cast é só para o
 * compilador, o valor de tempo de execução é o mesmo `process.env.NODE_ENV`.
 */
function setNodeEnv(value: string | undefined): void {
  const env = process.env as { NODE_ENV?: string };
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

describe('criação e leitura do cookie (ida e volta)', () => {
  it('lê de volta o mesmo id de usuário que assinou', () => {
    const { value } = createLocalSessionValue('usuario-123', 0);
    assert.deepEqual(readLocalSession(value), { userId: 'usuario-123', sessionVersion: 0 });
  });

  it('lê de volta a versão de sessão que assinou', () => {
    const { value } = createLocalSessionValue('usuario-123', 7);
    assert.deepEqual(readLocalSession(value), { userId: 'usuario-123', sessionVersion: 7 });
  });

  it('devolve a data de expiração combinando com SESSION_DAYS (30 dias)', () => {
    const antes = Date.now();
    const { expiresAt } = createLocalSessionValue('usuario-123', 0);
    const dias = (expiresAt.getTime() - antes) / (24 * 60 * 60 * 1000);
    assert.ok(dias > 29.9 && dias <= 30.1, `esperava ~30 dias, obteve ${dias}`);
  });
});

describe('cookie ausente ou malformado', () => {
  it('devolve null quando não há cookie', () => {
    assert.equal(readLocalSession(undefined), null);
  });

  it('devolve null para string vazia', () => {
    assert.equal(readLocalSession(''), null);
  });

  it('devolve null quando faltam partes (formato antigo, sem versão)', () => {
    assert.equal(readLocalSession('usuario-123.999999999999.assinatura'), null);
  });

  it('devolve null quando sobra uma parte', () => {
    const { value } = createLocalSessionValue('usuario-123', 0);
    assert.equal(readLocalSession(`${value}.extra`), null);
  });

  it('devolve null para lixo sem pontuação nenhuma', () => {
    assert.equal(readLocalSession('nao-e-um-cookie-de-sessao'), null);
  });
});

describe('assinatura', () => {
  it('rejeita assinatura adulterada', () => {
    const { value } = createLocalSessionValue('usuario-123', 0);
    const [userId, expiresAt, sessionVersion] = value.split('.');
    const adulterado = `${userId}.${expiresAt}.${sessionVersion}.${'0'.repeat(64)}`;
    assert.notEqual(adulterado, value, 'a assinatura de teste coincidiu com a real por acaso');
    assert.equal(readLocalSession(adulterado), null);
  });

  it('rejeita id trocado mesmo com a assinatura original', () => {
    const { value } = createLocalSessionValue('usuario-123', 0);
    const [, expiresAt, sessionVersion, signature] = value.split('.');
    // O ataque mais óbvio: pegar o próprio cookie válido e trocar o id para o
    // de outra pessoa, reaproveitando a assinatura antiga.
    const forjado = `outro-usuario.${expiresAt}.${sessionVersion}.${signature}`;
    assert.equal(readLocalSession(forjado), null);
  });

  it('rejeita prazo de expiração trocado mesmo com a assinatura original', () => {
    const { value } = createLocalSessionValue('usuario-123', 0);
    const [userId, , sessionVersion, signature] = value.split('.');
    const prazoEstendido = `${userId}.${Date.now() + 365 * 24 * 60 * 60 * 1000}.${sessionVersion}.${signature}`;
    assert.equal(readLocalSession(prazoEstendido), null);
  });

  it('rejeita versão de sessão trocada mesmo com a assinatura original', () => {
    const { value } = createLocalSessionValue('usuario-123', 0);
    const [userId, expiresAt, , signature] = value.split('.');
    // O ataque que a troca de senha precisa fechar: pegar um cookie de versão
    // antiga e tentar se passar por um mais novo trocando só o número.
    const versaoForjada = `${userId}.${expiresAt}.9.${signature}`;
    assert.equal(readLocalSession(versaoForjada), null);
  });

  it('rejeita assinatura vazia', () => {
    const { value } = createLocalSessionValue('usuario-123', 0);
    const [userId, expiresAt, sessionVersion] = value.split('.');
    assert.equal(readLocalSession(`${userId}.${expiresAt}.${sessionVersion}.`), null);
  });

  it('rejeita cookie assinado com outro segredo', () => {
    process.env.SESSION_SECRET = 'segredo-usado-para-assinar-um-cookie-valido';
    const payload = `usuario-123.${Date.now() + 60_000}.0`;
    const assinaturaComOutroSegredo = createHmac('sha256', 'segredo-diferente-do-configurado')
      .update(payload)
      .digest('hex');
    assert.equal(readLocalSession(`${payload}.${assinaturaComOutroSegredo}`), null);
  });
});

describe('versão de sessão', () => {
  it('rejeita versão não numérica mesmo com assinatura correspondente', () => {
    process.env.SESSION_SECRET = 'segredo-de-teste-para-verificar-versao';
    const payload = 'usuario-123.9999999999999.nao-e-um-numero';
    const assinatura = createHmac('sha256', 'segredo-de-teste-para-verificar-versao')
      .update(payload)
      .digest('hex');
    assert.equal(readLocalSession(`${payload}.${assinatura}`), null);
  });

  it('rejeita versão negativa mesmo com assinatura correspondente', () => {
    process.env.SESSION_SECRET = 'segredo-de-teste-para-verificar-versao';
    const payload = 'usuario-123.9999999999999.-1';
    const assinatura = createHmac('sha256', 'segredo-de-teste-para-verificar-versao')
      .update(payload)
      .digest('hex');
    assert.equal(readLocalSession(`${payload}.${assinatura}`), null);
  });
});

describe('expiração', () => {
  it('aceita um cookie assinado corretamente que ainda não venceu', () => {
    process.env.SESSION_SECRET = 'segredo-de-teste-para-verificar-expiracao';
    const expiraEm = Date.now() + 60_000;
    const payload = `usuario-123.${expiraEm}.0`;
    const assinatura = createHmac('sha256', 'segredo-de-teste-para-verificar-expiracao')
      .update(payload)
      .digest('hex');
    assert.deepEqual(readLocalSession(`${payload}.${assinatura}`), {
      userId: 'usuario-123',
      sessionVersion: 0,
    });
  });

  it('rejeita cookie com assinatura válida mas prazo vencido', () => {
    process.env.SESSION_SECRET = 'segredo-de-teste-para-verificar-expiracao';
    const expirouHaUmMinuto = Date.now() - 60_000;
    const payload = `usuario-123.${expirouHaUmMinuto}.0`;
    const assinatura = createHmac('sha256', 'segredo-de-teste-para-verificar-expiracao')
      .update(payload)
      .digest('hex');

    // A assinatura é legítima — é exatamente o cookie que o servidor teria
    // emitido um mês atrás. O que precisa barrar é só o prazo.
    assert.equal(readLocalSession(`${payload}.${assinatura}`), null);
  });

  it('rejeita prazo não numérico mesmo com assinatura correspondente', () => {
    process.env.SESSION_SECRET = 'segredo-de-teste-para-verificar-expiracao';
    const payload = 'usuario-123.nao-e-um-numero.0';
    const assinatura = createHmac('sha256', 'segredo-de-teste-para-verificar-expiracao')
      .update(payload)
      .digest('hex');
    assert.equal(readLocalSession(`${payload}.${assinatura}`), null);
  });
});

describe('segredo ausente', () => {
  it('usa o segredo de desenvolvimento fora de produção, sem lançar', () => {
    delete process.env.SESSION_SECRET;
    setNodeEnv(undefined);
    assert.doesNotThrow(() => createLocalSessionValue('usuario-123', 0));
  });

  it('recusa assinar sessão em produção sem SESSION_SECRET configurada', () => {
    delete process.env.SESSION_SECRET;
    setNodeEnv('production');
    assert.throws(
      () => createLocalSessionValue('usuario-123', 0),
      /SESSION_SECRET é obrigatória em produção/
    );
  });

  it('funciona normalmente em produção quando SESSION_SECRET está configurada', () => {
    setNodeEnv('production');
    process.env.SESSION_SECRET = 'segredo-de-producao-bem-comprido-o-suficiente';
    const { value } = createLocalSessionValue('usuario-123', 0);
    assert.deepEqual(readLocalSession(value), { userId: 'usuario-123', sessionVersion: 0 });
  });
});

describe('opções do cookie', () => {
  it('é sempre httpOnly, mesmo caminho e mesmo nome', () => {
    setNodeEnv(undefined);
    const expiresAt = new Date(Date.now() + 60_000);
    const options = sessionCookie.options(expiresAt);
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, 'lax');
    assert.equal(options.path, '/');
    assert.equal(options.expires, expiresAt);
    assert.equal(sessionCookie.name, 'cpro_session');
  });

  it('é secure em produção', () => {
    setNodeEnv('production');
    const options = sessionCookie.options(new Date());
    assert.equal(options.secure, true);
  });

  it('não é secure fora de produção (senão o cookie não gruda em http://localhost)', () => {
    setNodeEnv(undefined);
    const options = sessionCookie.options(new Date());
    assert.equal(options.secure, false);
  });
});
