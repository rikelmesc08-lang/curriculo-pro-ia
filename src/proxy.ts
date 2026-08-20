import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Repassa o caminho pedido para o servidor renderizar.
 *
 * POR QUE ISTO EXISTE: a checagem de sessão mora no layout de `/app`, e layout
 * não recebe o caminho da página. Sem este cabeçalho, quem abrisse
 * `/app/candidaturas` sem sessão seria mandado para o login e, ao entrar,
 * cairia no painel genérico — perdendo o link que tinha clicado.
 *
 * É `proxy.ts`, não `middleware.ts`: nesta versão do Next o nome `middleware`
 * está obsoleto e foi renomeado (ver
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
 *
 * O `matcher` cobre só as rotas do painel. Sem ele, o proxy rodaria em TODA
 * requisição, inclusive nos arquivos estáticos e nas imagens — custo puro,
 * já que nada fora de `/app` precisa deste cabeçalho.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-caminho-atual', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/app/:path*'],
};
