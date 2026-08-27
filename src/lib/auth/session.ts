import 'server-only';

import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getRepository } from '@/lib/db';
import { createSupabaseServerClient } from '@/lib/db/supabase/client';
import { env } from '@/lib/env';
import { caminhoInterno } from './destino';
import { getLocalSessionVersion } from './local';
import { readLocalSession, sessionCookie } from './session-cookie';
import type { SessionUser } from '@/types/user';

/**
 * Sessão do usuário, com os dois drivers atrás da mesma função.
 *
 * - `supabase`: quem valida a sessão é o Supabase Auth (cookie httpOnly
 *   gerenciado pelo @supabase/ssr).
 * - `local`: cookie próprio, assinado com HMAC-SHA256. O cookie carrega
 *   `id.expiracao.assinatura` — nunca a senha, nunca o e-mail. Sem a
 *   assinatura, qualquer pessoa editaria o id no navegador e entraria como
 *   outro usuário.
 *
 * A assinatura, a leitura e as opções do cookie moram em `./session-cookie`,
 * que não importa nada de `next/*` — ver o cabeçalho daquele arquivo para o
 * motivo (`next/navigation`, importado logo abaixo para `requireUser`, não
 * carrega fora de uma requisição real, o que impediria testar até a parte
 * pura deste módulo).
 */

const SESSION_COOKIE = sessionCookie.name;

export { createLocalSessionValue, sessionCookie } from './session-cookie';

/**
 * Usuário da requisição, ou `null` quando não há sessão válida.
 *
 * Nunca lança por falta de sessão — quem precisa de usuário chama
 * `requireUser()`. Isso deixa a landing e as páginas públicas usarem a mesma
 * função para decidir se mostram "Entrar" ou "Ir para o painel".
 *
 * ENVOLVIDA EM `cache()` DO REACT, DE PROPÓSITO: layout e página de `/app`
 * chamam `requireUser()` (que chama esta função) em paralelo, e cada chamada
 * criava seu próprio cliente Supabase e fazia sua própria ida a
 * `auth.getUser()` — duas renovações de sessão concorrentes disputando o
 * mesmo refresh token dentro da MESMA requisição. `cache()` do React dedupe
 * por render: a primeira chamada resolve, a segunda (mesmo argumento, aqui
 * nenhum) reaproveita a mesma Promise, sem segunda ida ao Supabase. O escopo
 * é por requisição — não sobrevive entre requisições diferentes nem entre
 * usuários.
 *
 * O `cache()` envolve só a LEITURA, nunca o `redirect()` de `requireUser()`
 * logo abaixo: `redirect()` lança, e cachear uma função que lança quebraria
 * o dedupe para toda chamada seguinte no mesmo render.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const driver = env.dbDriver();

  if (driver === 'supabase') {
    const client = await createSupabaseServerClient();
    // `getUser()` e não `getSession()`: só o primeiro revalida o token contra
    // o servidor do Supabase. `getSession()` confia no cookie, que é
    // exatamente o que não se deve fazer para decidir autorização.
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;

    const repository = await getRepository();
    const profile = await repository.findUserById(data.user.id);
    return {
      id: data.user.id,
      email: data.user.email ?? profile?.email ?? '',
      name: profile?.name ?? (data.user.user_metadata?.name as string | undefined) ?? '',
      plan: profile?.plan ?? 'gratuito',
      createdAt: profile?.createdAt ?? data.user.created_at,
      driver: 'supabase',
    };
  }

  const store = await cookies();
  const sessao = readLocalSession(store.get(SESSION_COOKIE)?.value);
  if (!sessao) return null;

  const repository = await getRepository();
  const user = await repository.findUserById(sessao.userId);
  if (!user) return null;

  // A versão gravada no cookie precisa bater com a versão do usuário. Trocar
  // a senha incrementa a versão do usuário e reemite o cookie só para quem
  // pediu a troca; qualquer outro cookie em circulação, com a versão antiga,
  // para de validar aqui — é a invalidação dos OUTROS dispositivos no driver
  // local. Ver `changeLocalPassword` em `./local`.
  const versaoAtual = await getLocalSessionVersion(sessao.userId);
  if (versaoAtual === null || versaoAtual !== sessao.sessionVersion) return null;

  return { ...user, driver: 'local' };
});

/**
 * Exige sessão. Redireciona para o login preservando o destino, para o usuário
 * voltar ao lugar onde clicou depois de entrar.
 *
 * O destino vem do cabeçalho `x-caminho-atual`, escrito por `src/proxy.ts`.
 * O parâmetro `returnTo` é a rede de segurança: se o proxy não tiver rodado
 * (uma rota fora do `matcher`, por exemplo), ainda há um destino sensato.
 */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user) return user;

  const requestHeaders = await headers();
  const destination = caminhoInterno(requestHeaders.get('x-caminho-atual')) ?? caminhoInterno(returnTo);

  redirect(destination ? `/login?proximo=${encodeURIComponent(destination)}` : '/login');
}

