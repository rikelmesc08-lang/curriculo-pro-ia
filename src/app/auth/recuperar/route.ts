import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/db/supabase/client';
import { env } from '@/lib/env';

/**
 * Retorno do link de recuperação enviado pelo Supabase.
 *
 * POR QUE UMA ROTA E NÃO A PRÓPRIA PÁGINA: trocar o código por uma sessão
 * ESCREVE COOKIE, e Server Component não pode escrever cookie — só Route
 * Handler e Server Action. Tentar fazer isso na página falha em silêncio (ver o
 * `catch` vazio em `db/supabase/client.ts`) e a pessoa chega na tela de senha
 * sem sessão nenhuma, recebendo "link expirado" para um link válido.
 *
 * Esta rota existe só no caminho Supabase. No driver local a prova é o token na
 * URL, verificado em `lib/auth/reset.ts`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  // Base a partir de SITE_URL, e não de `request.url`: atrás de proxy o host da
  // requisição pode ser interno, e o redirecionamento levaria a pessoa para um
  // endereço que o navegador dela não alcança.
  const base = env.siteUrl();

  if (!code) {
    return NextResponse.redirect(new URL('/esqueci-senha?erro=link-invalido', base));
  }

  if (env.dbDriver() !== 'supabase') {
    // Só acontece se alguém abrir esta URL à mão com o driver local ativo.
    return NextResponse.redirect(new URL('/esqueci-senha', base));
  }

  const client = await createSupabaseServerClient();
  const { error } = await client.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/recuperar]', error.message);
    return NextResponse.redirect(new URL('/esqueci-senha?erro=link-expirado', base));
  }

  // A sessão de recuperação está no cookie; a página de senha nova a usa para
  // autorizar o `updateUser`.
  return NextResponse.redirect(new URL('/nova-senha', base));
}
