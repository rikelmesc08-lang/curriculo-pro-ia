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

/**
 * Domínio do próprio deploy, quando este é um preview da Vercel.
 *
 * Devolve `undefined` em qualquer outra situação — produção, desenvolvimento
 * local, Docker, Fly, Render — e é isso que mantém o resto do projeto
 * independente de plataforma.
 *
 * O host é VALIDADO antes de virar URL. Ele vem da plataforma e não de um
 * cliente, mas o valor termina dentro de `new URL()` e de link de e-mail; um
 * host com barra ou arroba mudaria o destino do endereço montado, e a
 * checagem custa nada.
 */
function urlDoPreview(): string | undefined {
  if (process.env.VERCEL_ENV !== 'preview') return undefined;

  const host = read('VERCEL_BRANCH_URL') ?? read('VERCEL_URL');
  if (!host) return undefined;
  if (!/^[a-z0-9][a-z0-9.-]{0,252}[a-z0-9]$/i.test(host)) return undefined;

  return `https://${host}`;
}

export type DbDriver = 'local' | 'supabase';
export type AiProviderId = 'gemini' | 'anthropic' | 'demo';

function read(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Inteiro com piso, teto e padrão.
 *
 * Valor inválido cai no padrão em vez de virar `NaN`: um limite de uso que
 * vira `NaN` faz toda comparação dar `false`, e o controle de custo desliga
 * sozinho e em silêncio — exatamente o modo de falha que ele existe para
 * evitar.
 */
function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = read(name);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
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
   * Provedor de IA.
   *
   * A ORDEM DE PREFERÊNCIA É GEMINI PRIMEIRO, e isso é decisão de produto: o
   * Gemini tem camada gratuita de verdade, então quem clona o projeto consegue
   * IA real sem comprar crédito de ninguém. A Anthropic continua suportada para
   * quem já tem conta lá, mas nada no app a exige.
   *
   * Sem chave nenhuma cai em `demo`, que NÃO chama modelo nenhum e é rotulado
   * como demonstração em toda tela onde aparece. Nunca fingimos que a IA real
   * respondeu.
   */
  aiProvider(): AiProviderId {
    const value = read('AI_PROVIDER');
    if (value === 'demo' || value === 'gemini' || value === 'anthropic') return value;
    if (read('GEMINI_API_KEY')) return 'gemini';
    if (read('ANTHROPIC_API_KEY')) return 'anthropic';
    return 'demo';
  },

  geminiApiKey: () => read('GEMINI_API_KEY'),
  /**
   * Modelo do Gemini.
   *
   * `gemini-3.6-flash` é o padrão POR MEDIÇÃO, e o critério é DISPONIBILIDADE
   * antes de velocidade. Medido em agosto de 2026 sobre a análise completa deste
   * produto:
   *
   *   gemini-3.6-flash   3/3 chamadas | 22,5s | integridade limpa  <- escolhido
   *   gemini-3.5-flash   3/3 chamadas | 56,7s | integridade limpa
   *   gemini-3.7-flash   2/3 chamadas |  7,5s quando responde
   *
   * O 3.7 é o mais rápido de longe e foi descartado assim mesmo: ele voltou
   * "high demand" em uma de cada três chamadas. Modelo rápido que falha um
   * terço das vezes entrega, na média, uma espera pior que o de 22s — e entrega
   * junto uma tela de erro, que é o que o usuário lembra. Se ele estabilizar,
   * trocar é preencher GEMINI_MODEL.
   *
   * É um NOME FIXO, e não um apelido como `gemini-flash-latest`. Apelido muda o
   * modelo debaixo do produto sem aviso — e, como o nome não muda junto, o cache
   * continuaria servindo respostas do modelo antigo (ver
   * `services/ai/fingerprint.ts`).
   *
   * Trocar é preencher GEMINI_MODEL, sem tocar em código.
   */
  geminiModel: () => {
    const valor = read('GEMINI_MODEL');
    // O valor é concatenado numa URL. Um nome com barra ou "../" mudaria o
    // caminho da requisição e poderia apontá-la para outro endpoint da API —
    // SSRF de alcance limitado, mas gratuito de fechar. Só letras, números,
    // ponto e hífen passam; qualquer outra coisa cai no padrão.
    if (valor && /^[a-zA-Z0-9.-]{1,64}$/.test(valor)) return valor;
    if (valor) {
      console.error('[env] GEMINI_MODEL com formato inválido foi ignorado; usando o padrão.');
    }
    return 'gemini-3.6-flash';
  },

  anthropicApiKey: () => read('ANTHROPIC_API_KEY'),
  anthropicModel: () => read('ANTHROPIC_MODEL') ?? 'claude-sonnet-5',

  // --- Controle de custo da IA ---------------------------------------------
  //
  // Os números abaixo existem porque uma Server Action de IA autenticada e sem
  // limite é uma conta de API aberta para qualquer pessoa que tenha um login e
  // um laço de repetição. Os padrões são folgados para uso humano real e
  // apertados para script.

  /** Chamadas por usuário por hora. Contém o pico de um abuso. */
  aiHourlyLimit: () => readInt('AI_HOURLY_LIMIT', 15, 1, 1000),

  /** Chamadas por usuário por dia. Contém o acumulado. */
  aiDailyLimit: () => readInt('AI_DAILY_LIMIT', 40, 1, 5000),

  /**
   * Janela em que a mesma pergunta reaproveita a resposta já guardada.
   *
   * Clicar duas vezes no mesmo botão, com o mesmo currículo e a mesma vaga, não
   * pode custar duas chamadas. Cache servido também não conta contra os limites
   * acima: não chegou a ser requisição à IA.
   */
  aiCacheMinutes: () => readInt('AI_CACHE_MINUTES', 720, 0, 43200),

  /**
   * Trava da versão completa da análise atrás do plano pago.
   *
   * PADRÃO DESLIGADO, de propósito: enquanto o checkout não existe, ligar isto
   * põe cadeado numa porta sem chave — a pessoa clica em "desbloquear" e chega
   * numa tela que diz que a cobrança não está ativa. Todo o mecanismo de corte
   * está implementado e coberto por teste; ligar é trocar esta variável no dia
   * em que o pagamento entrar no ar.
   */
  aiPaywallEnabled: () => read('AI_PAYWALL') === 'on',

  /** Segredo que assina o cookie de sessão do driver local. */
  sessionSecret: () => read('SESSION_SECRET'),

  /** Diretório do banco JSON do driver local. */
  localDataDir: () => read('LOCAL_DATA_DIR') ?? '.data',

  /**
   * Endereço público deste ambiente. É a base de link de e-mail, URL canônica
   * e prévia de link.
   *
   * PREVIEW SE APONTA PARA SI MESMO. `SITE_URL` é um valor só, e em preview ele
   * carrega o domínio de PRODUÇÃO — então todo fluxo que passa por aqui saía do
   * preview e caía na produção. Na prática nenhum e-mail de confirmação ou de
   * recuperação era testável antes do merge, que é justamente quando testar
   * ainda adianta. O link ia parar num site rodando código antigo, sem erro
   * nenhum aparecer.
   *
   * A EXCEÇÃO VALE SÓ EM PREVIEW. Produção continua lendo `SITE_URL` e nada
   * mais: um deploy de produção que resolvesse o próprio endereço sozinho
   * mandaria e-mail de cliente para um domínio gerado pela plataforma.
   *
   * `VERCEL_BRANCH_URL` antes de `VERCEL_URL` porque o primeiro é estável por
   * branch e o segundo muda a cada deploy — e a lista de endereços permitidos
   * do Supabase precisa casar com o que mandamos.
   *
   * Fora da Vercel nada disto existe, as variáveis são `undefined`, e a função
   * se comporta exatamente como antes.
   */
  siteUrl: () => urlDoPreview() ?? read('SITE_URL') ?? 'http://localhost:3000',

  hasSiteUrl: () => Boolean(read('SITE_URL')),

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
/**
 * Avisa quando SITE_URL falta em produção.
 *
 * AVISA, NÃO DERRUBA — e a diferença em relação a `assertDriverAllowed` é
 * deliberada. Driver errado destrói dado do usuário em silêncio, e ali vale
 * parar o boot. SITE_URL ausente estraga URL canônica e prévia de link: é ruim,
 * é invisível por meses, mas derrubar o site inteiro por um problema de
 * metadado seria pior que o problema.
 *
 * O aviso sai uma vez por processo. Repetir a cada renderização afogaria o log
 * justamente onde ele precisa ser notado.
 */
let siteUrlAvisado = false;

export function warnMissingSiteUrl(): void {
  if (siteUrlAvisado || !env.isProduction() || env.hasSiteUrl()) return;
  siteUrlAvisado = true;
  console.error(
    '[env] SITE_URL não configurada em produção. As URLs canônicas, o Open Graph e a prévia de link vão apontar para http://localhost:3000. Defina SITE_URL com o domínio público (ex.: https://curriculopro.com.br).'
  );
}

export function assertDriverAllowed(): void {
  if (env.isProduction() && env.dbDriver() === 'local') {
    throw new Error(
      'DB_DRIVER=local não é permitido em produção: o disco é efêmero e os dados dos usuários seriam perdidos sem aviso. Configure SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
}
