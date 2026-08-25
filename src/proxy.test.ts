import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { config, proxy } from './proxy';

/**
 * Proxy de borda — CSP, upgrade http→https e o cabeçalho de caminho atual.
 *
 * Os três caminhos que mais importam aqui nunca acontecem em
 * desenvolvimento: `NODE_ENV` nunca é `production` num `npm run dev`, então
 * o redirecionamento https e a política de produção só rodam pela primeira
 * vez em produção, sem cobertura nenhuma até agora. Um erro na condição do
 * redirecionamento deixaria HTML trafegar em claro; um erro no `matcher`
 * deixaria uma rota inteira sem CSP, ou faria a sonda de saúde entrar num
 * loop de reinício.
 */

const NODE_ENV_ORIGINAL = process.env.NODE_ENV;

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

afterEach(() => {
  setNodeEnv(NODE_ENV_ORIGINAL);
});

function request(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers });
}

describe('redirecionamento para https', () => {
  it('redireciona 308 quando em produção e o proxy diz que o pedido chegou em http', () => {
    setNodeEnv('production');
    const req = request('http://curriculopro.com.br/app/candidaturas?x=1', {
      'x-forwarded-proto': 'http',
    });

    const res = proxy(req);

    assert.equal(res.status, 308, 'não preservou o método/corpo original (301/302 viraria GET)');
    assert.equal(res.headers.get('location'), 'https://curriculopro.com.br/app/candidaturas?x=1');
  });

  it('não redireciona quando o cabeçalho já diz https', () => {
    setNodeEnv('production');
    const req = request('http://curriculopro.com.br/app', { 'x-forwarded-proto': 'https' });

    const res = proxy(req);

    assert.notEqual(res.status, 308);
  });

  it('não redireciona quando o cabeçalho x-forwarded-proto está ausente', () => {
    // Cenário real: a sonda de saúde interna chama em http, sem passar por
    // nenhum proxy de borda que escreva x-forwarded-proto. Redirecionar aqui
    // faria a plataforma achar o contêiner doente e reiniciar em loop.
    setNodeEnv('production');
    const req = request('http://localhost/app');

    const res = proxy(req);

    assert.notEqual(res.status, 308);
  });

  it('não redireciona fora de produção mesmo com x-forwarded-proto: http', () => {
    setNodeEnv('development');
    const req = request('http://localhost:3000/app', { 'x-forwarded-proto': 'http' });

    const res = proxy(req);

    assert.notEqual(res.status, 308);
  });
});

describe('cabeçalho de caminho atual', () => {
  it('repassa o caminho da página para o Next ler no layout', () => {
    setNodeEnv('development');
    const req = request('http://localhost:3000/app/candidaturas?filtro=ativas');

    const res = proxy(req);

    // O Next expõe os cabeçalhos que foram escritos na requisição repassada
    // através de `x-middleware-request-*` — é como o teste confere, sem
    // subir uma página de verdade, que o valor chegou até o próximo passo.
    assert.equal(res.headers.get('x-middleware-request-x-caminho-atual'), '/app/candidaturas');
  });
});

describe('Content-Security-Policy', () => {
  it('inclui um nonce, e o nonce muda a cada requisição', () => {
    setNodeEnv('development');
    const nonce1 = proxy(request('http://localhost:3000/')).headers.get('x-middleware-request-x-nonce');
    const nonce2 = proxy(request('http://localhost:3000/')).headers.get('x-middleware-request-x-nonce');

    assert.ok(nonce1);
    assert.ok(nonce2);
    assert.notEqual(nonce1, nonce2, 'dois pedidos receberam o mesmo nonce — CSP replayável');
  });

  it('a CSP da resposta usa o mesmo nonce que foi repassado na requisição', () => {
    setNodeEnv('development');
    const res = proxy(request('http://localhost:3000/'));
    const nonce = res.headers.get('x-middleware-request-x-nonce');
    const csp = res.headers.get('content-security-policy');

    assert.ok(csp);
    assert.ok(nonce);
    assert.ok(csp!.includes(`'nonce-${nonce}'`));
  });

  it('em produção não tem unsafe-eval nem ws/wss em connect-src', () => {
    setNodeEnv('production');
    const csp = proxy(request('https://curriculopro.com.br/', { 'x-forwarded-proto': 'https' })).headers.get(
      'content-security-policy'
    );

    assert.ok(csp);
    assert.ok(!csp!.includes('unsafe-eval'), 'produção com unsafe-eval é uma porta de XSS aberta');
    assert.ok(!csp!.includes('ws:') && !csp!.includes('wss:'));
    assert.match(csp!, /script-src[^;]*'strict-dynamic'/);
    assert.ok(csp!.includes('upgrade-insecure-requests'));
  });

  it('fora de produção tem unsafe-eval (recarregador do Next) e ws/wss (HMR)', () => {
    setNodeEnv('development');
    const csp = proxy(request('http://localhost:3000/')).headers.get('content-security-policy');

    assert.ok(csp);
    assert.ok(csp!.includes('unsafe-eval'));
    assert.ok(csp!.includes('ws:') && csp!.includes('wss:'));
    assert.ok(!csp!.includes('upgrade-insecure-requests'), 'upgrade-insecure-requests não faz sentido em dev');
  });

  it('inclui as diretivas fixas de proteção contra clickjacking e XSS', () => {
    setNodeEnv('production');
    const csp = proxy(request('https://curriculopro.com.br/', { 'x-forwarded-proto': 'https' })).headers.get(
      'content-security-policy'
    );

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
