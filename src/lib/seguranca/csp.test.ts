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

/**
 * `unsafe-inline` em `style-src` é uma concessão deliberada (ver comentário de
 * `politicaBase()` em `csp.ts`) — mas em `script-src` seria abrir mão da
 * proteção inteira contra XSS, e `strict-dynamic` + nonce só funciona sem ele.
 * É exatamente o tipo de "correção rápida" que alguém aplicaria para
 * destravar um script bloqueado sem entender a política: trocar nonce por
 * `unsafe-inline`. Os testes anteriores checam a AUSÊNCIA de `unsafe-eval`,
 * mas nunca afirmaram a ausência de `unsafe-inline` em `script-src`
 * especificamente — e como `style-src` legitimamente TEM `unsafe-inline`, um
 * `!politica.includes('unsafe-inline')` ingênuo falharia sempre. Por isso o
 * teste isola o trecho de `script-src` antes de checar.
 */
describe('script-src nunca tem unsafe-inline', () => {
  function trechoScriptSrc(cspCompleta: string): string {
    const trecho = cspCompleta.split('; ').find((diretiva) => diretiva.startsWith('script-src'));
    assert.ok(trecho, 'a política não tem script-src nenhum — isso sozinho já seria uma regressão grave');
    return trecho!;
  }

  for (const producao of [true, false]) {
    it(`politica() — produção=${producao}`, () => {
      assert.ok(!trechoScriptSrc(politica(NONCE, producao)).includes('unsafe-inline'));
    });

    it(`politicaMeta() — produção=${producao}`, () => {
      assert.ok(!trechoScriptSrc(politicaMeta(NONCE, producao)).includes('unsafe-inline'));
    });
  }
});

/**
 * Teste de baseline: a string inteira, byte a byte, para a política de
 * produção. Mais frágil que os testes acima (qualquer diretiva nova quebra
 * este teste e exige atualização deliberada) — e é essa fragilidade que dá a
 * cobertura: uma diretiva adicionada, removida ou reordenada por engano em
 * `politicaBase()` aparece aqui, mesmo que nenhum teste específico de diretiva
 * a cubra ainda.
 */
describe('baseline — string completa da política de produção', () => {
  it('politica() (cabeçalho)', () => {
    assert.equal(
      politica(NONCE, true),
      "default-src 'self'; script-src 'self' 'nonce-nonce-de-teste-abc123' 'strict-dynamic'; " +
        "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; " +
        "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; " +
        "frame-ancestors 'none'; manifest-src 'self'; upgrade-insecure-requests"
    );
  });

  it('politicaMeta() — igual, menos frame-ancestors', () => {
    assert.equal(
      politicaMeta(NONCE, true),
      "default-src 'self'; script-src 'self' 'nonce-nonce-de-teste-abc123' 'strict-dynamic'; " +
        "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; " +
        "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; " +
        "manifest-src 'self'; upgrade-insecure-requests"
    );
  });
});
