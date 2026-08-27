import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Cliente Supabase da requisição: autentica como o usuário logado, via cookie
 * de sessão, e portanto respeita a RLS. É o único cliente que o app usa —
 * não existe caminho `service_role` aqui, porque nada neste produto precisa
 * ler dado de outro usuário.
 *
 * `cookies()` é assíncrono no App Router desta versão do Next, então esta
 * função também é. Crie um cliente novo por requisição; nunca reaproveite
 * entre requisições.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const url = env.supabaseUrl();
  const anonKey = env.supabaseAnonKey();

  if (!url || !anonKey) {
    throw new Error(
      'SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórias com DB_DRIVER=supabase. Configure-as em .env.local ou use DB_DRIVER=local.'
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    // Endurece o cookie além do padrão da lib (que é httpOnly: false). Nada
    // no projeto lê a sessão via JavaScript do navegador, então httpOnly não
    // quebra nada — e fecha a porta de um XSS futuro roubar o token.
    // `secure` fica condicionado a produção porque em dev o app roda em
    // http://localhost, e o navegador descarta cookie `Secure` fora de HTTPS.
    cookieOptions: {
      httpOnly: true,
      secure: env.isProduction(),
      sameSite: 'lax',
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components não podem escrever cookie — só Server Actions e
          // Route Handlers. Ignorar aqui é o comportamento recomendado pelo
          // @supabase/ssr; a renovação da sessão acontece no próximo POST.
        }
      },
    },
  });
}

/**
 * Cliente só para REVALIDAR uma senha, nunca para ler ou escrever sessão.
 *
 * Usado por `changePasswordAction` (`src/lib/auth/actions.ts`) para conferir
 * a senha ATUAL antes de trocar. A forma de conferir uma senha no Supabase
 * Auth é tentar `signInWithPassword` com ela — não existe um endpoint
 * "só verifique, não abra sessão".
 *
 * POR ISSO ESTE CLIENTE NÃO TOCA COOKIE NENHUM: ao contrário de
 * `createSupabaseServerClient`, que lê e grava o cookie da requisição, este
 * não recebe `cookies()` do Next e não tem onde persistir nada
 * (`persistSession: false`, `autoRefreshToken: false`). Se `signInWithPassword`
 * tentasse gravar uma sessão nova aqui, ela morreria em memória junto com o
 * cliente — nunca chegaria ao `Set-Cookie` da resposta.
 *
 * A alternativa óbvia — reaproveitar `createSupabaseServerClient()` para a
 * verificação — foi descartada de propósito: aquele cliente ESTÁ ligado ao
 * cookie da requisição, e uma nova sessão emitida por `signInWithPassword`
 * ali sobrescreveria a sessão em curso do usuário só para confirmar uma
 * senha, sem necessidade nenhuma.
 */
export function createSupabaseVerifyClient(): SupabaseClient {
  const url = env.supabaseUrl();
  const anonKey = env.supabaseAnonKey();

  if (!url || !anonKey) {
    throw new Error(
      'SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórias com DB_DRIVER=supabase. Configure-as em .env.local ou use DB_DRIVER=local.'
    );
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
