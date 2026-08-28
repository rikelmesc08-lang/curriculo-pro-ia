import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { NAV_ITEMS, RETORNO_PADRAO, ferramentaPor, rotaDeRetorno } from './AppNav';

/**
 * A lista de navegação virou duas coisas ao mesmo tempo, e a segunda tem
 * consequência de segurança.
 *
 * A primeira é texto: cada ferramenta descreve a própria tela vazia. Se um
 * `href` de página não casar com nenhum item daqui, a tela cai num título
 * genérico e a pessoa volta a ver a mesma coisa em todas as abas — o defeito
 * que esta mudança existe para consertar, reaparecendo em silêncio.
 *
 * A segunda é a validação do `?voltar=` da tela de importação. Esse valor vem
 * da URL, ou seja, de qualquer pessoa capaz de fazer outra clicar num link.
 */

describe('rotaDeRetorno — defesa contra redirecionamento aberto', () => {
  it('aceita o endereço de uma ferramenta que pede currículo', () => {
    assert.equal(rotaDeRetorno('/app/analise'), '/app/analise');
    assert.equal(rotaDeRetorno('/app/carta'), '/app/carta');
  });

  it('recusa endereço externo', () => {
    // O caso que dá nome à classe: sair do nosso domínio logo depois de a
    // pessoa importar o currículo, que é quando ela mais confia na tela.
    assert.equal(rotaDeRetorno('https://site-de-golpe.example/'), RETORNO_PADRAO);
    assert.equal(rotaDeRetorno('http://site-de-golpe.example/'), RETORNO_PADRAO);
  });

  it('recusa URL relativa ao protocolo, que "começa com barra" e mesmo assim sai do site', () => {
    // `//host` é lido pelo navegador como absoluta com o protocolo atual. Uma
    // checagem ingênua de "começa com /" deixaria passar.
    assert.equal(rotaDeRetorno('//site-de-golpe.example/'), RETORNO_PADRAO);
    assert.equal(rotaDeRetorno('/\\site-de-golpe.example/'), RETORNO_PADRAO);
  });

  it('recusa tentativa de contornar por codificação', () => {
    assert.equal(rotaDeRetorno('%2F%2Fsite-de-golpe.example'), RETORNO_PADRAO);
    assert.equal(rotaDeRetorno('/app/analise%00'), RETORNO_PADRAO);
    assert.equal(rotaDeRetorno('/app/analise/../../fora'), RETORNO_PADRAO);
  });

  it('recusa tela do painel que não manda ninguém importar', () => {
    // A lista de retorno é exatamente a lista de telas que pedem importação.
    // `/app/configuracoes` é interna e inofensiva, mas não tem por que estar
    // aqui — e superfície que não compra nada não fica.
    assert.equal(rotaDeRetorno('/app/configuracoes'), RETORNO_PADRAO);
    assert.equal(rotaDeRetorno('/app/candidaturas'), RETORNO_PADRAO);
    assert.equal(rotaDeRetorno('/app'), RETORNO_PADRAO);
  });

  it('recusa ausência, tipo errado e valor repetido na query', () => {
    assert.equal(rotaDeRetorno(undefined), RETORNO_PADRAO);
    assert.equal(rotaDeRetorno(''), RETORNO_PADRAO);
    // `?voltar=a&voltar=b` chega como array. Escolher um dos dois seria adivinhar.
    assert.equal(rotaDeRetorno(['/app/analise', '/app/carta']), RETORNO_PADRAO);
  });

  it('o destino padrão é uma rota interna do painel', () => {
    assert.ok(RETORNO_PADRAO.startsWith('/app'));
  });
});

describe('texto da tela vazia de cada ferramenta', () => {
  const comCurriculo = NAV_ITEMS.filter((item) => item.semCurriculo);

  it('as seis ferramentas que exigem currículo têm texto próprio', () => {
    assert.equal(comCurriculo.length, 6);
  });

  it('nenhum título se repete entre ferramentas', () => {
    // Título repetido é literalmente o defeito relatado: "em toda aba que
    // clico aparece criar currículo".
    const titulos = comCurriculo.map((item) => item.semCurriculo!.titulo);
    assert.equal(new Set(titulos).size, titulos.length, `títulos repetidos: ${titulos.join(' | ')}`);
  });

  it('nenhuma promessa se repete, e nenhuma está vazia', () => {
    const promessas = comCurriculo.map((item) => item.semCurriculo!.promessa);
    assert.equal(new Set(promessas).size, promessas.length);
    for (const promessa of promessas) {
      assert.ok(promessa.trim().length > 20, `promessa curta demais: "${promessa}"`);
    }
  });

  it('o título começa pelo que a ferramenta FAZ, não pelo que falta', () => {
    // "Para analisar…", "Para escrever a carta…". A versão antiga começava por
    // "Você ainda não tem…", que põe a falta na frente do propósito e é o que
    // fazia as seis telas soarem idênticas.
    for (const item of comCurriculo) {
      assert.match(
        item.semCurriculo!.titulo,
        /^Para /,
        `"${item.semCurriculo!.titulo}" (${item.href}) devia começar por "Para "`
      );
    }
  });
});

describe('as páginas e a lista não saem de sincronia', () => {
  /**
   * Lê o `href` que cada página passa para `<NoResumeNotice />` e confere que
   * ele existe aqui. É o teste que impede a volta silenciosa do defeito: um
   * `href` com erro de digitação compila, não quebra nada, e simplesmente cai
   * no título genérico — de novo a mesma tela em toda aba.
   */
  const PAGINAS = [
    'src/app/app/analise/page.tsx',
    'src/app/app/analisar-vaga/page.tsx',
    'src/app/app/otimizar/page.tsx',
    'src/app/app/carta/page.tsx',
    'src/app/app/entrevista/page.tsx',
    'src/app/app/mensagens/page.tsx',
  ];

  for (const pagina of PAGINAS) {
    it(`${pagina} aponta para uma ferramenta que existe e tem texto`, () => {
      const fonte = readFileSync(new URL(`../../../${pagina}`, import.meta.url), 'utf8');
      const achado = /<NoResumeNotice\s+href="([^"]+)"/.exec(fonte);

      assert.ok(achado, `não achei <NoResumeNotice href="…" /> em ${pagina}`);

      const item = ferramentaPor(achado[1]);
      assert.ok(item, `href "${achado[1]}" não existe em NAV_ITEMS`);
      assert.ok(item.semCurriculo, `"${achado[1]}" não tem texto de tela vazia`);
    });
  }

  /**
   * A VOLTA PASSA PELO FORMULÁRIO. Sempre.
   *
   * A primeira versão desta mudança mandava a pessoa direto da importação para
   * a ferramenta. Duas coisas quebravam: o botão que ela clicava diz "conferir
   * e corrigir no formulário" e não levava a formulário nenhum; e, pior, ela
   * passava a usar um currículo que a IA transcreveu sem ninguém conferir —
   * o oposto do que o topo de `resume-import.ts` declara. No teste que
   * encontrou isto, o modelo tinha deixado o cargo pretendido em branco.
   *
   * Estes testes leem o fonte porque as páginas são componentes de servidor
   * com `requireUser` e acesso a banco: não carregam no runner.
   */
  it('a importação manda para o formulário, nunca direto para a ferramenta', () => {
    const fonte = readFileSync(
      new URL('../../../src/app/app/curriculo/importar/page.tsx', import.meta.url),
      'utf8'
    );

    const achado = /const destino = origem\s*\?\s*`([^`]+)`/.exec(fonte);
    assert.ok(achado, 'não achei como o destino pós-importação é montado');
    assert.ok(
      achado[1].startsWith('/app/curriculo?'),
      `o destino virou "${achado[1]}" — pular o formulário faz a pessoa usar um currículo não conferido`
    );
  });

  it('o formulário oferece a volta, e só para destino validado', () => {
    const fonte = readFileSync(
      new URL('../../../src/app/app/curriculo/page.tsx', import.meta.url),
      'utf8'
    );

    // O link tem que sair de `rotaDeRetorno`, e não do parâmetro cru: é o que
    // impede um `?voltar=https://site-de-golpe/` virar href de um botão que a
    // pessoa clica logo depois de importar o currículo.
    assert.match(fonte, /rotaDeRetorno\(params\.voltar\)/, 'o formulário não valida o ?voltar=');
    assert.match(fonte, /Voltar para \{volta\.label\}/, 'sumiu o botão de volta');
    assert.doesNotMatch(
      fonte,
      /href=\{params\.voltar/,
      'o href não pode vir do parâmetro cru da URL'
    );
  });

  it('toda ferramenta com texto de tela vazia é um destino de retorno válido', () => {
    // As duas listas precisam ser a MESMA. Se uma ferramenta ganha tela vazia
    // mas não é destino válido, ela manda a pessoa importar e depois a joga no
    // editor — exatamente o comportamento que esta mudança removeu.
    for (const item of NAV_ITEMS) {
      if (!item.semCurriculo) continue;
      assert.equal(rotaDeRetorno(item.href), item.href, `${item.href} não volta para si mesmo`);
    }
  });
});
