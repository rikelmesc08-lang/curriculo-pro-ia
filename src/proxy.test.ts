import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { config, proxy } from './proxy';

/**
 * Proxy de borda — CSP, upgrade http→https, o cabeçalho de caminho atual e a
 * renovação da sessão Supabase.
 *
 * Os três caminhos que mais importam aqui nunca acontecem em
 * desenvolvimento: `NODE_ENV` nunca é `production` num `npm run dev`, então
 * o redirecionamento https e a política de produção só rodam pela primeira
 * vez em produção, sem cobertura nenhuma até agora. Um erro na condição do
 * redirecionamento deixaria HTML trafegar em claro; um erro no `matcher`
 * deixaria uma rota inteira sem CSP, ou faria a sonda de saúde entrar num
 * loop de reinício.
 *
 * `proxy()` é `async` desde que passou a renovar a sessão Supabase — todo
 * teste abaixo precisa dar `await`.
 */

const NODE_ENV_ORIGINAL = process.env.NODE_ENV;
const ENV_ORIGINAL = { ...process.env };

/**
 * `NODE_ENV` é tipado como somente-leitura em `@types/node` (é normalmente
 * definido pela ferramenta, não pela aplicação). O teste precisa alterná-lo
 * para exercitar os dois ramos de `proxy()`; o cast é só para o compilador.
 */
function setNodeEnv(value: string | undefined): void {
  const env = process.env as { NODE_ENV?: string };
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ENV_ORIGINAL)) delete process.env[key];
  }
  Object.assign(process.env, ENV_ORIGINAL);
  setNodeEnv(NODE_ENV_ORIGINAL);
}

afterEach(() => {
  restoreEnv();
});

function request(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers });
}

describe('redirecionamento para https', () => {
  it('redireciona 308 quando em produção e o proxy diz que o pedido chegou em http', async () => {
    setNodeEnv('production');
    const req = request('http://curriculopro.com.br/app/candidaturas?x=1', {
      'x-forwarded-proto': 'http',
    });

    const res = await proxy(req);

    assert.equal(res.status, 308, 'não preservou o método/corpo original (301/302 viraria GET)');
    assert.equal(res.headers.get('location'), 'https://curriculopro.com.br/app/candidaturas?x=1');
  });

  it('não redireciona quando o cabeçalho já diz https', async () => {
    setNodeEnv('production');
    const req = request('http://curriculopro.com.br/app', { 'x-forwarded-proto': 'https' });

    const res = await proxy(req);

    assert.notEqual(res.status, 308);
  });

  it('não redireciona quando o cabeçalho x-forwarded-proto está ausente', async () => {
    // Cenário real: a sonda de saúde interna chama em http, sem passar por
    // nenhum proxy de borda que escreva x-forwarded-proto. Redirecionar aqui
    // faria a plataforma achar o contêiner doente e reiniciar em loop.
    setNodeEnv('production');
    const req = request('http://localhost/app');

    const res = await proxy(req);

    assert.notEqual(res.status, 308);
  });

  it('não redireciona fora de produção mesmo com x-forwarded-proto: http', async () => {
    setNodeEnv('development');
    const req = request('http://localhost:3000/app', { 'x-forwarded-proto': 'http' });

    const res = await proxy(req);

    assert.notEqual(res.status, 308);
  });
});

describe('cabeçalho de caminho atual', () => {
  it('repassa o caminho da página para o Next ler no layout', async () => {
    setNodeEnv('development');
    const req = request('http://localhost:3000/app/candidaturas?filtro=ativas');

    const res = await proxy(req);

    // O Next expõe os cabeçalhos que foram escritos na requisição repassada
    // através de `x-middleware-request-*` — é como o teste confere, sem
    // subir uma página de verdade, que o valor chegou até o próximo passo.
    assert.equal(res.headers.get('x-middleware-request-x-caminho-atual'), '/app/candidaturas');
  });
});

describe('Content-Security-Policy', () => {
  it('inclui um nonce, e o nonce muda a cada requisição', async () => {
    setNodeEnv('development');
    const nonce1 = (await proxy(request('http://localhost:3000/'))).headers.get('x-middleware-request-x-nonce');
    const nonce2 = (await proxy(request('http://localhost:3000/'))).headers.get('x-middleware-request-x-nonce');

    assert.ok(nonce1);
    assert.ok(nonce2);
    assert.notEqual(nonce1, nonce2, 'dois pedidos receberam o mesmo nonce — CSP replayável');
  });

  it('a CSP da resposta usa o mesmo nonce que foi repassado na requisição', async () => {
    setNodeEnv('development');
    const res = await proxy(request('http://localhost:3000/'));
    const nonce = res.headers.get('x-middleware-request-x-nonce');
    const csp = res.headers.get('content-security-policy');

    assert.ok(csp);
    assert.ok(nonce);
    assert.ok(csp!.includes(`'nonce-${nonce}'`));
  });

  it('em produção não tem unsafe-eval nem ws/wss em connect-src', async () => {
    setNodeEnv('production');
    const res = await proxy(request('https://curriculopro.com.br/', { 'x-forwarded-proto': 'https' }));
    const csp = res.headers.get('content-security-policy');

    assert.ok(csp);
    assert.ok(!csp!.includes('unsafe-eval'), 'produção com unsafe-eval é uma porta de XSS aberta');
    assert.ok(!csp!.includes('ws:') && !csp!.includes('wss:'));
    assert.match(csp!, /script-src[^;]*'strict-dynamic'/);
    assert.ok(csp!.includes('upgrade-insecure-requests'));
  });

  it('fora de produção tem unsafe-eval (recarregador do Next) e ws/wss (HMR)', async () => {
    setNodeEnv('development');
    const res = await proxy(request('http://localhost:3000/'));
    const csp = res.headers.get('content-security-policy');

    assert.ok(csp);
    assert.ok(csp!.includes('unsafe-eval'));
    assert.ok(csp!.includes('ws:') && csp!.includes('wss:'));
    assert.ok(!csp!.includes('upgrade-insecure-requests'), 'upgrade-insecure-requests não faz sentido em dev');
  });

  it('inclui as diretivas fixas de proteção contra clickjacking e XSS', async () => {
    setNodeEnv('production');
    const res = await proxy(request('https://curriculopro.com.br/', { 'x-forwarded-proto': 'https' }));
    const csp = res.headers.get('content-security-policy');

    assert.ok(csp);
    for (const diretiva of [
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "default-src 'self'",
    ]) {
      assert.ok(csp!.includes(diretiva), `faltou a diretiva "${diretiva}"`);
    }
  });
});

describe('renovação da sessão Supabase', () => {
  /**
   * `DB_DRIVER` não fica setado no ambiente de teste, e não há `SUPABASE_URL`
   * nem `SUPABASE_ANON_KEY` configuradas — então `env.dbDriver()` cai em
   * `local` (`hasSupabaseConfig()` é falso). Cobre o caminho "nada a
   * renovar": o proxy precisa continuar respondendo, sem tentar falar com o
   * Supabase e sem lançar.
   */
  it('não mexe em cookie quando o driver não é supabase', async () => {
    delete process.env.DB_DRIVER;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    setNodeEnv('development');

    const res = await proxy(request('http://localhost:3000/app', { cookie: 'sb-access-token=qualquer' }));

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('set-cookie'), null);
  });

  /**
   * `DB_DRIVER=supabase` sem as credenciais configuradas é justamente o modo
   * de falha que `createSupabaseServerClient()` trata lançando — mas o proxy
   * não pode propagar essa exceção: ele roda na frente de TODA página HTML,
   * inclusive a landing pública, e uma configuração incompleta em produção
   * não pode derrubar o site inteiro.
   */
  it('degrada em silêncio quando o driver é supabase mas faltam as credenciais', async () => {
    process.env.DB_DRIVER = 'supabase';
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    setNodeEnv('development');

    const res = await proxy(request('http://localhost:3000/app'));

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('set-cookie'), null);
  });
});

describe('config.matcher', () => {
  it('exclui a sonda de saúde interna, para não entrar em loop de reinício', () => {
    assert.equal(config.matcher.length, 1);
    const padrao = config.matcher[0];
    assert.ok(padrao.includes('api/saude'), 'o matcher não menciona mais api/saude');
  });

  it('exclui os arquivos estáticos que o next.config.mjs já cobre', () => {
    const padrao = config.matcher[0];
    for (const excecao of ['_next/static', '_next/image', 'favicon.ico', 'robots.txt', 'sitemap.xml']) {
      assert.ok(padrao.includes(excecao), `o matcher não menciona mais ${excecao}`);
    }
  });
});
