import 'server-only';

import { assertDriverAllowed, env } from '@/lib/env';
import { localRepository } from './local/repository';
import { createSupabaseServerClient } from './supabase/client';
import { createSupabaseRepository } from './supabase/repository';
import type { Repository } from './repository';

export type { Repository } from './repository';

/**
 * Devolve o repositório da requisição atual.
 *
 * É assíncrono porque o driver Supabase precisa ler os cookies da requisição
 * para montar um cliente autenticado — não há como resolver isso no import.
 */
export async function getRepository(): Promise<Repository> {
  assertDriverAllowed();
  if (env.dbDriver() === 'supabase') {
    return createSupabaseRepository(await createSupabaseServerClient());
  }
  return localRepository;
}
