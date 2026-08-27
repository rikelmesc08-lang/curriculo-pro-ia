import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createSupabaseServerClient, createSupabaseVerifyClient } from './client';

/**
 * Criação do cliente Supabase da requisição.
 *
 * O caminho testado aqui — variável de ambiente ausente — é o que protege
 * contra o pior tipo de falha de configuração: sem ele, `DB_DRIVER=supabase`
 * com `SUPABASE_URL` ou `SUPABASE_ANON_KEY` esquecida chegaria à biblioteca
 * do Supabase com `url` ou `key` como `undefined`, e o erro que voltaria
 * seria dela — genérico, sem dizer qual variável falta nem onde configurar.
 *
 * O CAMINHO DE SUCESSO NÃO ESTÁ COBERTO AQUI: criar o cliente de verdade
 * chama `cookies()`, de `next/headers`, que só existe dentro de uma
 * requisição real do Next — chamar fora disso lança
 * "`cookies` was called outside a request scope" mesmo com as variáveis
 * configuradas. É a mesma limitação documentada em
 * `src/lib/auth/throttle.ts` para `verificarLimite`: a parte que depende do
 * framework não é testável fora dele; o que é testável sem subir o Next —
 * aqui, a validação das variáveis de ambiente — está coberto.
 */

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

afterEach(() => {
  restoreEnv();
});

describe('variáveis de ambiente ausentes', () => {
  it('recusa criar o cliente sem SUPABASE_URL', async () => {
    delete process.env.SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = 'anon-key-de-teste';

    await assert.rejects(
      () => createSupabaseServerClient(),
      /SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórias/
    );
  });

  it('recusa criar o cliente sem SUPABASE_ANON_KEY', async () => {
    process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
    delete process.env.SUPABASE_ANON_KEY;

    await assert.rejects(
      () => createSupabaseServerClient(),
      /SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórias/
    );
  });

  it('recusa criar o cliente sem nenhuma das duas', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    await assert.rejects(() => createSupabaseServerClient());
  });

  it('trata string em branco como ausente (não passa "" adiante para a biblioteca)', async () => {
    process.env.SUPABASE_URL = '   ';
    process.env.SUPABASE_ANON_KEY = 'anon-key-de-teste';

    await assert.rejects(
      () => createSupabaseServerClient(),
      /SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórias/
    );
  });

  it('a mensagem de erro orienta a configurar .env.local ou trocar para DB_DRIVER=local', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    await assert.rejects(
      () => createSupabaseServerClient(),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /\.env\.local/);
        assert.match(error.message, /DB_DRIVER=local/);
        return true;
      }
    );
  });
});

/**
 * `createSupabaseVerifyClient` — usado por `changePasswordAction` para
 * revalidar a senha ATUAL antes de trocar (ver `src/lib/auth/actions.ts`).
 *
 * Ao contrário de `createSupabaseServerClient`, este NÃO chama `cookies()`
 * de `next/headers` — não tem cookie nenhum para ler ou escrever, de
 * propósito (ver comentário no arquivo de origem). Por isso o caminho de
 * SUCESSO também é testável aqui, fora de uma requisição do Next.
 */
describe('cliente de revalidação de senha (createSupabaseVerifyClient)', () => {
  it('recusa criar sem as variáveis de ambiente, com a mesma mensagem do cliente principal', () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    assert.throws(
      () => createSupabaseVerifyClient(),
      /SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórias/
    );
  });

  it('cria o cliente sem depender de next/headers quando as variáveis existem', () => {
    process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key-de-teste';

    // Não lança "cookies was called outside a request scope" — é exatamente
    // o comportamento que o justifica existir separado do cliente principal.
    assert.doesNotThrow(() => createSupabaseVerifyClient());
  });

  it('nunca persiste nem renova sessão automaticamente (não tem onde gravar cookie)', () => {
    process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key-de-teste';

    const client = createSupabaseVerifyClient() as unknown as {
      auth: { persistSession?: boolean; autoRefreshToken?: boolean };
    };

    // A biblioteca guarda as opções normalizadas dentro do próprio client;
    // conferir aqui é o que impede uma mudança futura de religar
    // `persistSession` por engano e reabrir o risco que este cliente existe
    // para fechar.
    assert.equal(client.auth.persistSession, false);
    assert.equal(client.auth.autoRefreshToken, false);
  });
});
