/**
 * Valida o destino para onde o usuário volta depois de entrar.
 *
 * O valor chega do CLIENTE — `?proximo=` na URL de login, campo escondido no
 * formulário — e termina dentro de `redirect()`. Se ele puder apontar para
 * fora, o site vira trampolim de phishing: a pessoa abre um link com o domínio
 * verdadeiro na barra, digita a senha na página verdadeira, autentica de
 * verdade, e só então é jogada no site do atacante — que copia a interface e
 * pede a senha "de novo", já com toda a confiança conquistada pelo login que
 * acabou de funcionar. É o pior momento possível para entregar o usuário.
 *
 * POR QUE NÃO SE FAZ ISSO PROIBINDO CARACTERE
 * Havia aqui duas checagens escritas à mão, e as duas eram insuficientes.
 * Testados no navegador contra o site publicado, quatro valores diferentes
 * escapavam da origem, e cada um passava por uma das versões:
 *
 *     //evil.com     protocolo relativo
 *     /\evil.com     barra invertida — o parser de URL a trata como barra
 *     /<TAB>/evil.com
 *     /<LF>/evil.com o navegador REMOVE tab, LF e CR da URL antes de
 *     /<CR>/evil.com resolvê-la, e o que sobra é `//evil.com`
 *
 * Os três últimos começam com uma única barra e não contêm nada obviamente
 * suspeito: qualquer lista de caracteres proibidos escrita de memória deixa
 * passar pelo menos um. E a lista precisa estar certa contra o parser de URL,
 * não contra a intuição de quem a escreve.
 *
 * ENTÃO PERGUNTAMOS AO PRÓPRIO PARSER. Resolvemos o valor contra uma origem
 * de mentira e exigimos que ele continue lá. O `URL` do Node segue a mesma
 * especificação (WHATWG) que o do navegador, incluindo a barra invertida e a
 * remoção de tab/LF/CR — verificado nos dois. Não há lista para manter, e um
 * vetor novo de normalização de URL já nasce coberto.
 *
 * O retorno é remontado a partir do que o parser produziu, e não do texto
 * original: o que sai daqui é sempre caminho + query + fragmento normalizados.
 */
const ORIGEM_DE_TESTE = 'https://destino.invalid';

export function caminhoInterno(valor: string | null | undefined): string | null {
  // Precisa começar com uma barra. Sem isto, `evil.com` seria lido como
  // caminho relativo e `https://evil.com` como URL absoluta.
  if (!valor || !valor.startsWith('/')) return null;

  let url: URL;
  try {
    url = new URL(valor, ORIGEM_DE_TESTE);
  } catch {
    return null;
  }

  // Saiu da origem de mentira? Então aponta para fora.
  if (url.origin !== ORIGEM_DE_TESTE) return null;

  return url.pathname + url.search + url.hash;
}

/**
 * Mesma validação, com um destino padrão para quando o valor não serve.
 * Existe para o caminho pós-login, onde não redirecionar não é opção.
 */
export function destinoOuPadrao(valor: string | null | undefined, padrao = '/app'): string {
  return caminhoInterno(valor) ?? padrao;
}
