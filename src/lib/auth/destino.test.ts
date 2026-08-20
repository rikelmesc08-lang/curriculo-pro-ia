import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { caminhoInterno, destinoOuPadrao } from './destino';

/**
 * Os quatro primeiros casos de `escapa da origem` não são hipóteses: foram
 * executados no navegador, contra o site publicado, e os quatro resolviam para
 * `https://evil.com`. Três deles passavam pelas duas validações que existiam
 * antes deste módulo — começam com uma barra só e não têm nada de estranho à
 * vista.
 *
 * Se um dia alguém trocar esta implementação por uma lista de caracteres
 * proibidos, é aqui que a troca falha.
 */
describe('caminhoInterno', () => {
  describe('recusa o que sai da origem', () => {
    const ataques: Array<[string, string]> = [
      ['protocolo relativo', '//evil.com'],
      ['barra invertida, lida como barra pelo parser', '/\\evil.com'],
      ['barra invertida dupla', '/\\\\evil.com'],
      ['barra invertida depois de barra', '/\\/evil.com'],
      ['tab, removida pelo navegador antes de resolver', '/\t/evil.com'],
      ['nova linha, idem', '/\n/evil.com'],
      ['retorno de carro, idem', '/\r/evil.com'],
      ['URL absoluta', 'https://evil.com/app'],
      ['URL absoluta sem barra inicial', 'evil.com'],
      ['esquema javascript', 'javascript:alert(1)'],
      ['esquema de dados', 'data:text/html,<script>alert(1)</script>'],
      ['caminho relativo', 'app'],
      ['credenciais embutidas', '//user:senha@evil.com'],
    ];

    for (const [rotulo, valor] of ataques) {
      it(`${rotulo}: ${JSON.stringify(valor)}`, () => {
        assert.equal(caminhoInterno(valor), null);
        // E o caminho pós-login cai no padrão, nunca no valor do atacante.
        assert.equal(destinoOuPadrao(valor), '/app');
      });
    }
  });

  describe('aceita e normaliza destino interno', () => {
    it('caminho simples', () => {
      assert.equal(caminhoInterno('/app'), '/app');
    });

    it('preserva query e fragmento — o usuário volta ao lugar exato', () => {
      assert.equal(caminhoInterno('/app/analise?id=7#erros'), '/app/analise?id=7#erros');
    });

    it('devolve o valor do parser, não o texto cru', () => {
      assert.equal(caminhoInterno('/app/meu curriculo'), '/app/meu%20curriculo');
    });

    it('raiz', () => {
      assert.equal(caminhoInterno('/'), '/');
    });
  });

  describe('valores ausentes', () => {
    for (const vazio of [null, undefined, '']) {
      it(`${JSON.stringify(vazio)} vira null`, () => {
        assert.equal(caminhoInterno(vazio), null);
      });
    }

    it('destinoOuPadrao aceita outro padrão', () => {
      assert.equal(destinoOuPadrao(null, '/app/analise'), '/app/analise');
    });
  });
});
