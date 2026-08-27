import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Assinatura e leitura do cookie de sessão do driver local — extraído de
 * `session.ts` para ficar livre de `next/navigation`.
 *
 * `session.ts` importa `redirect` de `next/navigation` (usado por
 * `requireUser`), e esse módulo do Next só carrega dentro de uma requisição
 * ou build real — inclusive `require('next/navigation')` sozinho falha fora
 * desse contexto. Isso impede importar QUALQUER coisa de `session.ts`,
 * inclusive a verificação pura de assinatura, de dentro de `node:test`.
 *
 * Isolando aqui a parte sem nenhum `next/*`, o teste exercita diretamente a
 * checagem que mais importa — assinatura HMAC, comparação em tempo
 * constante e expiração — sem subir o framework. O comportamento observável
 * é idêntico ao de antes: `session.ts` importa e reexporta tudo daqui.
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

/**
 * Monta o valor do cookie. Só o driver local chama isto.
 *
 * `sessionVersion` viaja assinado dentro do próprio cookie e é conferido, na
 * leitura, contra o valor gravado no usuário (`StoredUser.sessionVersion`,
 * ver `src/lib/auth/local.ts`). Trocar a senha incrementa esse valor e emite
 * um cookie novo só para quem pediu a troca — todo outro cookie em circulação
 * carrega o número antigo e para de validar no pedido seguinte. É o
 * equivalente, no driver local, ao `signOut({ scope: 'others' })` do driver
 * Supabase.
 */
export function createLocalSessionValue(
  userId: string,
  sessionVersion: number
): { value: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const payload = `${userId}.${expiresAt.getTime()}.${sessionVersion}`;
  return { value: `${payload}.${sign(payload)}`, expiresAt };
}

export interface SessaoLocal {
  userId: string;
  sessionVersion: number;
}

/**
 * Devolve o id do usuário e a versão de sessão gravados no cookie, se ele for
 * válido e não estiver expirado.
 *
 * MUDANÇA DE FORMATO: cookies emitidos antes deste campo existir tinham três
 * partes (`id.expiração.assinatura`); os emitidos agora têm quatro
 * (`id.expiração.versão.assinatura`). Um cookie de três partes é tratado como
 * inválido, e não como "versão zero" — aceitar as duas formas abriria a
 * possibilidade de um cookie antigo, sem versão nenhuma, nunca ser pego pela
 * invalidação. Como o driver local só roda em desenvolvimento, o efeito
 * prático é: sessões locais abertas antes desta mudança encerram e a pessoa
 * entra de novo uma vez.
 */
export function readLocalSession(raw: string | undefined): SessaoLocal | null {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 4) return null;

  const [userId, expiresAtRaw, sessionVersionRaw, signature] = parts;
  if (!safeEqual(sign(`${userId}.${expiresAtRaw}.${sessionVersionRaw}`), signature)) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;

  const sessionVersion = Number(sessionVersionRaw);
  if (!Number.isInteger(sessionVersion) || sessionVersion < 0) return null;

  return { userId, sessionVersion };
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
