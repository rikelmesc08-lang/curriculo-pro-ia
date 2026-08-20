import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getRepository } from '@/lib/db';
import { createSupabaseServerClient } from '@/lib/db/supabase/client';
import { env } from '@/lib/env';
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
 */

const SESSION_COOKIE = 'cpro_session';
const SESSION_DAYS = 30;

/**
 * Segredo de assinatura.
 *
 * O fallback de desenvolvimento não é descuido: o driver local só existe em
 * desenvolvimento (`assertDriverAllowed` recusa em produção), e exigir uma
 * variável para rodar `npm run dev` mataria o objetivo de "clona e roda".
 * Em produção o driver é Supabase, que não usa este segredo — mas se alguém
 * um dia ligar o driver local lá, a exceção abaixo avisa em vez de assinar
 * sessões com um segredo que está no repositório.
 */
function sessionSecret(): string {
  const configured = env.sessionSecret();
  if (configured) return configured;
  if (env.isProduction()) {
    throw new Error('SESSION_SECRET é obrigatória em produção para assinar a sessão.');
  }
  return 'desenvolvimento-apenas-nao-use-em-producao';
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Monta o valor do cookie. Só o driver local chama isto. */
export function createLocalSessionValue(userId: string): { value: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const payload = `${userId}.${expiresAt.getTime()}`;
  return { value: `${payload}.${sign(payload)}`, expiresAt };
}

/** Devolve o id do usuário se o cookie for válido e não estiver expirado. */
function readLocalSession(raw: string | undefined): string | null {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;

  const [userId, expiresAtRaw, signature] = parts;
  if (!safeEqual(sign(`${userId}.${expiresAtRaw}`), signature)) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  return userId;
}

export const sessionCookie = {
  name: SESSION_COOKIE,
  options(expiresAt: Date) {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: env.isProduction(),
      path: '/',
      expires: expiresAt,
    };
  },
};

/**
 * Usuário da requisição, ou `null` quando não há sessão válida.
 *
 * Nunca lança por falta de sessão — quem precisa de usuário chama
 * `requireUser()`. Isso deixa a landing e as páginas públicas usarem a mesma
 * função para decidir se mostram "Entrar" ou "Ir para o painel".
 */
export async function getSessionUser(): Promise<SessionUser | null> {
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
  const userId = readLocalSession(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;

  const repository = await getRepository();
  const user = await repository.findUserById(userId);
  if (!user) return null;

  return { ...user, driver: 'local' };
}

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

/**
 * Aceita apenas caminho interno; qualquer outra coisa vira `null`.
 *
 * O destino sai daqui direto para `redirect()`. Hoje o valor vem do proxy,
 * que sobrescreve o cabeçalho com o próprio caminho da requisição — mas o
 * `matcher` do proxy é uma configuração, e no dia em que uma rota ficar de
 * fora dele, o cabeçalho passa a vir do CLIENTE. Sem esta validação, seria
 * um open redirect: `x-caminho-atual: https://site-falso/login` levaria a
 * vítima para uma tela de login clonada, vinda de um link legítimo deste
 * domínio.
 *
 * `//` é recusado junto com `http://` porque `//outro.site` é URL absoluta
 * de protocolo relativo — o truque que passa por uma checagem ingênua de
 * "começa com barra".
 */
function caminhoInterno(valor: string | null | undefined): string | null {
  if (!valor || !valor.startsWith('/') || valor.startsWith('//')) return null;
  if (valor.includes('\\')) return null;
  return valor;
}
