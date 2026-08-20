import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/db/supabase/client';
import { env } from '@/lib/env';

/**
 * Retorno do link de confirmação de e-mail enviado pelo Supabase no cadastro.
 *
 * ESTA ROTA NÃO EXISTIA, e a falta dela quebrava o cadastro inteiro em
 * produção. `signUp` não passava `emailRedirectTo`, então o Supabase caía no
 * campo "Site URL" do painel dele — que ainda era `http://localhost:3000`. Quem
 * se cadastrava recebia um e-mail cujo link apontava para a própria máquina, e
 * lá não havia nada rodando. O cadastro parecia funcionar, o e-mail chegava, e
 * a conta ficava inacessível.
 *
 * Detalhe que salvou a conta de teste: o link passa PRIMEIRO pelo Supabase, que
 * marca o e-mail como confirmado, e só então redireciona. O destino quebrado
 * impedia a sessão automática, não a confirmação.
 *
 * POR QUE UMA ROTA E NÃO A PÁGINA: igual a `/auth/recuperar` — trocar o código
 * por sessão ESCREVE COOKIE, e Server Component não pode escrever cookie. Numa
 * página isso falha em silêncio e a pessoa chega sem sessão.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  // Base a partir de SITE_URL, e não de `request.url`: atrás de proxy o host da
  // requisição pode ser interno, e o redirecionamento levaria a pessoa para um
  // endereço que o navegador dela não alcança.
  const base = env.siteUrl();

  if (!code || env.dbDriver() !== 'supabase') {
    return NextResponse.redirect(new URL('/login?erro=confirmacao', base));
  }

  const client = await createSupabaseServerClient();
  const { error } = await client.auth.exchangeCodeForSession(code);

  if (error) {
    // Caso comum e nada alarmante: link já usado, ou expirado. A conta pode
    // muito bem já estar confirmada — por isso o destino é o login, e não uma
    // tela de erro que faria a pessoa achar que precisa se cadastrar de novo.
    console.error('[auth/confirmar]', error.message);
    return NextResponse.redirect(new URL('/login?erro=confirmacao', base));
  }

  // Sessão criada: a pessoa entra direto, sem digitar a senha de novo.
  return NextResponse.redirect(new URL('/app', base));
}
