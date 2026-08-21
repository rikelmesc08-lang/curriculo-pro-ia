import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createSupabaseServerClient } from './client';

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
