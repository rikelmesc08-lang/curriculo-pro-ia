import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { politica } from '@/lib/seguranca/csp';
import { env } from '@/lib/env';

/**
 * Proxy de borda: cabeçalho de caminho, HTTPS, Content-Security-Policy e
 * renovação da sessão Supabase.
 *
 * É `proxy.ts`, não `middleware.ts`: nesta versão do Next o nome `middleware`
 * está obsoleto e foi renomeado (ver
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
 *
 * Quatro responsabilidades, e cada uma precisa rodar antes da renderização:
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
 *
 *   4. Renovação da sessão Supabase — `src/lib/db/supabase/client.ts` cria o
 *      cliente da requisição com um `setAll` que ENGOLE a escrita de cookie em
 *      Server Component (só Server Action e Route Handler podem gravar
 *      cookie ali; é o padrão recomendado pelo `@supabase/ssr`). Sem alguém
 *      que PODE gravar cookie renovando a sessão, o access token renovado e o
 *      refresh token rotacionado a cada chamada eram descartados a cada
 *      requisição — e a requisição seguinte tentava renovar de novo a partir
 *      de um refresh token já consumido, o que produzia ora `/login`, ora um
 *      500 (`JWT issued at future`, o GoTrue cunhando um token no mesmo
 *      segundo em que o PostgREST o recebia). O proxy é o único ponto por
 *      requisição que roda antes da renderização e pode gravar `Set-Cookie` —
 *      por isso a renovação mora aqui.
 */

// A política (as diretivas fixas e o porquê de cada uma) mora em
// `src/lib/seguranca/csp.ts` — compartilhada com `src/app/layout.tsx`, que
// escreve a mesma política num `<meta>` para sobreviver ao CDN da Hostinger
// (ver comentário de `politicaMeta()` naquele arquivo).

/**
 * Renova a sessão Supabase da requisição, quando o driver for `supabase`.
 *
 * Devolve os cookies que precisam chegar na RESPOSTA (`Set-Cookie`). Os
 * mesmos cookies também são escritos em `request.cookies` — isso muta em
 * lugar o cabeçalho `Cookie` do `NextRequest` (`RequestCookies.set` escreve
 * de volta em `this._headers`), então o `new Headers(request.headers)` feito
 * logo depois, em `proxy()`, já enxerga o token renovado. É assim que o
 * Server Component seguinte (`requireUser` → `getSessionUser`) lê a sessão
 * já válida, em vez de tentar renovar de novo com o refresh token antigo.
 *
 * Nunca lança: `driver !== 'supabase'`, credenciais ausentes ou qualquer erro
 * do Supabase degradam em silêncio para "sem renovação" — o comportamento de
 * hoje. Um proxy que derruba toda página HTML por causa de uma renovação de
 * sessão seria uma queda pior que a que ele veio corrigir.
 */
async function renovarSessaoSupabase(
  request: NextRequest
): Promise<Array<{ name: string; value: string; options: CookieOptions }>> {
  if (env.dbDriver() !== 'supabase') return [];

  const url = env.supabaseUrl();
  const anonKey = env.supabaseAnonKey();
  if (!url || !anonKey) return [];

  const cookiesParaResposta: Array<{ name: string; value: string; options: CookieOptions }> = [];

  try {
    const supabase = createServerClient(url, anonKey, {
      // Mesmo endurecimento de `src/lib/db/supabase/client.ts` — as duas
      // configurações de cookie precisam concordar, senão o cookie escrito
      // aqui e o lido lá divergem em `secure`/`sameSite`.
      cookieOptions: {
        httpOnly: true,
        secure: env.isProduction(),
        sameSite: 'lax',
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            cookiesParaResposta.push({ name, value, options: options ?? {} });
          }
        },
      },
    });

    // `getUser()`, não `getSession()` — só o primeiro revalida (e renova)
    // contra o servidor do Supabase, em vez de confiar no cookie recebido.
    await supabase.auth.getUser();
  } catch (erro) {
    console.error('[proxy] falha ao renovar sessão do Supabase; seguindo sem renovar', erro);
  }

  return cookiesParaResposta;
}

export async function proxy(request: NextRequest) {
  const producao = process.env.NODE_ENV === 'production';

  // --- HTTPS ---------------------------------------------------------------
  // Atrás de proxy (Vercel, Render, Fly), o protocolo real vem no cabeçalho; o
  // `request.nextUrl.protocol` diz "http" mesmo quando o visitante está em
  // https. Confiar no cabeçalho aqui é seguro porque quem o escreve é a borda
  // da plataforma, e é a única informação disponível.
  //
  // Este redirecionamento acontece ANTES de qualquer trabalho de Supabase: um
  // 308 aqui nunca deve esperar uma chamada de rede à toa.
  const protocolo = request.headers.get('x-forwarded-proto');
  if (producao && protocolo === 'http') {
    const destino = new URL(request.url);
    destino.protocol = 'https:';
    // 308 preserva o método e o corpo — um POST redirecionado com 301/302 vira
    // GET e a ação do usuário se perde em silêncio.
    return NextResponse.redirect(destino, 308);
  }

  // --- Sessão Supabase -------------------------------------------------------
  const cookiesRenovados = await renovarSessaoSupabase(request);

  // --- Nonce ---------------------------------------------------------------
  // `crypto` da Web API: funciona tanto no runtime de borda (onde
  // `node:crypto` não existe) quanto no runtime Node.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  // Construído A PARTIR de `request.headers` DEPOIS da renovação acima: se
  // `renovarSessaoSupabase` reescreveu o cookie da requisição, esta cópia já
  // carrega o valor novo, e é o que chega ao Server Component seguinte.
  const headers = new Headers(request.headers);
  headers.set('x-caminho-atual', request.nextUrl.pathname);
  // O Next lê este cabeçalho para carimbar o nonce nos scripts que ele injeta.
  headers.set('x-nonce', nonce);

  const csp = politica(nonce, producao);
  headers.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers } });
  // E também na resposta, que é onde o navegador lê.
  response.headers.set('content-security-policy', csp);

  // Cookies renovados vão na resposta que o navegador recebe — é o
  // `Set-Cookie` que faltava para a sessão sobreviver à próxima requisição.
  for (const { name, value, options } of cookiesRenovados) {
    response.cookies.set(name, value, options);
  }

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
