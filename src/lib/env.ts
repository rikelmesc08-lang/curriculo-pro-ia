import 'server-only';

/**
 * Todas as variáveis de ambiente do servidor num lugar só.
 *
 * NENHUMA VARIÁVEL DESTE ARQUIVO TEM PREFIXO `NEXT_PUBLIC_`, e isso é
 * deliberado: o prefixo faz o Next inlinar o valor no pacote que o navegador
 * baixa. Como todo acesso a Supabase e a IA acontece em Server Actions e Route
 * Handlers, nada aqui precisa chegar ao cliente. Se um dia alguém importar
 * este módulo de um componente `"use client"`, o `import 'server-only'` acima
 * quebra o build — que é exatamente o aviso desejado.
 *
 * Toda leitura é uma função, não uma constante: constante seria avaliada no
 * momento do import (build time), quando a variável ainda não existe.
 */

export type DbDriver = 'local' | 'supabase';
export type AiProviderId = 'anthropic' | 'demo';

function read(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export const env = {
  /**
   * Driver de persistência.
   *
   * O padrão é `local` — o app roda e é utilizável assim que se faz
   * `npm run dev`, sem exigir conta em serviço nenhum. `local` grava JSON em
   * disco (ver `src/lib/db/local/store.ts`), serve para desenvolvimento e
   * demonstração, e é BLOQUEADO em produção por `assertDriverAllowed()`:
   * disco de plataforma serverless é efêmero, e um usuário real perderia os
   * dados sem nenhum erro aparecer.
   */
  dbDriver(): DbDriver {
    const value = read('DB_DRIVER');
    if (value === 'supabase' || value === 'local') return value;
    return this.hasSupabaseConfig() ? 'supabase' : 'local';
  },

  supabaseUrl: () => read('SUPABASE_URL'),
  supabaseAnonKey: () => read('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: () => read('SUPABASE_SERVICE_ROLE_KEY'),

  hasSupabaseConfig(): boolean {
    return Boolean(read('SUPABASE_URL') && read('SUPABASE_ANON_KEY'));
  },

  /**
   * Provedor de IA. Sem chave configurada cai em `demo`, que NÃO chama modelo
   * nenhum e é rotulado como demonstração em toda tela onde aparece. Nunca
   * fingimos que a IA real respondeu.
   */
  aiProvider(): AiProviderId {
    const value = read('AI_PROVIDER');
    if (value === 'demo') return 'demo';
    if (value === 'anthropic') return 'anthropic';
    return read('ANTHROPIC_API_KEY') ? 'anthropic' : 'demo';
  },

  anthropicApiKey: () => read('ANTHROPIC_API_KEY'),
  anthropicModel: () => read('ANTHROPIC_MODEL') ?? 'claude-sonnet-5',

  /** Segredo que assina o cookie de sessão do driver local. */
  sessionSecret: () => read('SESSION_SECRET'),

  /** Diretório do banco JSON do driver local. */
  localDataDir: () => read('LOCAL_DATA_DIR') ?? '.data',

  siteUrl: () => read('SITE_URL') ?? 'http://localhost:3000',

  isProduction: () => process.env.NODE_ENV === 'production',
};

/**
 * Impede que o driver `local` seja usado em produção.
 *
 * O modo de falha que isto evita é silencioso, e por isso perigoso: em
 * produção o app subiria, aceitaria cadastro, gravaria o currículo em disco
 * efêmero e perderia tudo no próximo deploy — sem erro em log nenhum. Melhor
 * derrubar o boot com uma mensagem clara.
 */
export function assertDriverAllowed(): void {
  if (env.isProduction() && env.dbDriver() === 'local') {
    throw new Error(
      'DB_DRIVER=local não é permitido em produção: o disco é efêmero e os dados dos usuários seriam perdidos sem aviso. Configure SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
}
