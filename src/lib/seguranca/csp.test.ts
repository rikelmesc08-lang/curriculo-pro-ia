import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { politica, politicaMeta } from './csp';

/**
 * `politica()` (cabeçalho) e `politicaMeta()` (`<meta>` no `<head>`, ver
 * `src/app/layout.tsx`) precisam nascer da mesma lista de diretivas — é o
 * problema que a extração deste módulo resolveu. O que este arquivo cobre é
 * exatamente o contrário do caminho feliz: as duas variantes divergindo em
 * silêncio, ou a variante de `<meta>` carregando uma diretiva que o navegador
 * vai rejeitar (e que, por rejeitar em silêncio, ninguém notaria sem teste).
 */

const NONCE = 'nonce-de-teste-abc123';

describe('politicaMeta — diretivas inválidas em <meta>', () => {
  it('não inclui frame-ancestors', () => {
    const meta = politicaMeta(NONCE, true);

    assert.ok(
      !meta.includes('frame-ancestors'),
      'frame-ancestors em <meta> é ignorado pelo navegador (com aviso no console) — não faz nada, e a proteção real contra clickjacking é o X-Frame-Options do next.config.mjs'
    );
  });

  it('não inclui report-uri nem sandbox — inválidas em <meta> como frame-ancestors', () => {
    const meta = politicaMeta(NONCE, true);

    assert.ok(!meta.includes('report-uri'));
    assert.ok(!meta.includes('sandbox'));
  });

  it('continua com frame-ancestors na variante de cabeçalho', () => {
    // Confere que a omissão é exclusiva de politicaMeta(), e não um efeito
    // colateral que também apagou a diretiva do cabeçalho.
    const cabecalho = politica(NONCE, true);

    assert.ok(cabecalho.includes("frame-ancestors 'none'"));
  });
});

describe('politica() e politicaMeta() — mesma política, duas entregas', () => {
  it('usam o mesmo nonce', () => {
    const cabecalho = politica(NONCE, true);
    const meta = politicaMeta(NONCE, true);

    assert.ok(cabecalho.includes(`'nonce-${NONCE}'`));
    assert.ok(meta.includes(`'nonce-${NONCE}'`));
  });

  it('trazem as mesmas diretivas fora frame-ancestors — nenhuma diverge em silêncio', () => {
    for (const producao of [true, false]) {
      const cabecalho = politica(NONCE, producao);
      const meta = politicaMeta(NONCE, producao);

      const diretivasDoCabecalho = cabecalho
        .split('; ')
        .filter((diretiva) => !diretiva.startsWith('frame-ancestors'));
      const diretivasDoMeta = meta.split('; ');

      assert.deepEqual(
        diretivasDoMeta,
        diretivasDoCabecalho,
        `produção=${producao}: as diretivas de <meta> deveriam ser exatamente as do cabeçalho, menos frame-ancestors`
      );
    }
  });
});

describe('politica() — produção', () => {
  it('não tem unsafe-eval', () => {
    const cabecalho = politica(NONCE, true);

    assert.ok(!cabecalho.includes('unsafe-eval'), 'produção com unsafe-eval é uma porta de XSS aberta');
  });
});

describe('politicaMeta() — produção', () => {
  it('não tem unsafe-eval', () => {
    const meta = politicaMeta(NONCE, true);

    assert.ok(!meta.includes('unsafe-eval'), 'produção com unsafe-eval é uma porta de XSS aberta');
  });

  it('mantém strict-dynamic e upgrade-insecure-requests', () => {
    const meta = politicaMeta(NONCE, true);

    assert.match(meta, /script-src[^;]*'strict-dynamic'/);
    assert.ok(meta.includes('upgrade-insecure-requests'));
  });
});
