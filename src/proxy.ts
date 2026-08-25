import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { politica } from '@/lib/seguranca/csp';

/**
 * Proxy de borda: cabeçalho de caminho, HTTPS e Content-Security-Policy.
 *
 * É `proxy.ts`, não `middleware.ts`: nesta versão do Next o nome `middleware`
 * está obsoleto e foi renomeado (ver
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
 *
 * Três responsabilidades, e cada uma precisa rodar antes da renderização:
 *
 *   1. `x-caminho-atual` — a checagem de sessão mora no layout de `/app`, e
 *      layout não recebe o caminho da página. Sem este cabeçalho, quem abrisse
 *      `/app/candidaturas` sem sessão seria mandado para o login e, ao entrar,
 *      cairia no painel genérico, perdendo o link que tinha clicado.
 *
 *   2. HTTPS em produção — redirecionar aqui garante que nenhum HTML chegue a
 *      ser renderizado sobre conexão em claro.
 *
 *   3. CSP com nonce — precisa ser gerada por requisição e repassada ao Next
 *      antes de ele montar a página, e este é o único ponto onde isso acontece.
 */

// A política (as diretivas fixas e o porquê de cada uma) mora em
// `src/lib/seguranca/csp.ts` — compartilhada com `src/app/layout.tsx`, que
// escreve a mesma política num `<meta>` para sobreviver ao CDN da Hostinger
// (ver comentário de `politicaMeta()` naquele arquivo).

export function proxy(request: NextRequest) {
  const producao = process.env.NODE_ENV === 'production';

  // --- HTTPS ---------------------------------------------------------------
  // Atrás de proxy (Vercel, Render, Fly), o protocolo real vem no cabeçalho; o
  // `request.nextUrl.protocol` diz "http" mesmo quando o visitante está em
  // https. Confiar no cabeçalho aqui é seguro porque quem o escreve é a borda
  // da plataforma, e é a única informação disponível.
  const protocolo = request.headers.get('x-forwarded-proto');
  if (producao && protocolo === 'http') {
    const destino = new URL(request.url);
    destino.protocol = 'https:';
    // 308 preserva o método e o corpo — um POST redirecionado com 301/302 vira
    // GET e a ação do usuário se perde em silêncio.
    return NextResponse.redirect(destino, 308);
  }

  // --- Nonce ---------------------------------------------------------------
  // `crypto` da Web API: o proxy roda no runtime de borda, onde `node:crypto`
  // não existe.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const headers = new Headers(request.headers);
  headers.set('x-caminho-atual', request.nextUrl.pathname);
  // O Next lê este cabeçalho para carimbar o nonce nos scripts que ele injeta.
  headers.set('x-nonce', nonce);

  const csp = politica(nonce, producao);
  headers.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers } });
  // E também na resposta, que é onde o navegador lê.
  response.headers.set('content-security-policy', csp);

  return response;
}

export const config = {
  /*
   * Tudo, menos o que não precisa.
   *
   * O matcher cobria só `/app/:path*` quando a única função era o cabeçalho de
   * caminho. A CSP precisa acompanhar TODA página que devolve HTML — inclusive
   * a landing, o login e as páginas legais — senão a política protege o painel
   * e deixa o resto aberto.
   *
   * Os arquivos estáticos ficam de fora: já são servidos com cabeçalhos fixos
   * por `next.config.mjs`, não executam nada, e passá-los pelo proxy custaria uma
   * execução de função por imagem.
   *
   * `api/saude` TAMBÉM FICA DE FORA, e este é um caso que só apareceu rodando:
   * a sonda de vida é chamada por dentro do contêiner, em http no endereço de
   * loopback. Passando pelo proxy, ela recebia o 308 de redirecionamento para
   * https — a plataforma leria isso como falha, marcaria o contêiner como
   * doente e o reiniciaria em laço, para sempre. Sonda interna não é tráfego
   * de usuário e não deve ser redirecionada.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|opengraph-image|robots.txt|sitemap.xml|api/saude).*)',
  ],
};
