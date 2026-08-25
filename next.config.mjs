/**
 * Cabeçalhos de segurança que valem para TODA resposta.
 *
 * A Content-Security-Policy NÃO está aqui: ela carrega um nonce por requisição
 * e é montada em `src/proxy.ts`. O que fica neste arquivo é o conjunto fixo, que
 * também precisa cobrir os arquivos estáticos — e esses não passam pelo proxy.
 */
const CABECALHOS = [
  {
    // Impede o navegador de "adivinhar" o tipo de um arquivo pelo conteúdo. Sem
    // isto, um arquivo servido como texto pode ser interpretado como script.
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    // A CSP já traz `frame-ancestors 'none'`, que é a forma moderna e tem
    // precedência. Este cabeçalho fica para navegadores que ignoram a diretiva.
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    // Origem completa só dentro do site; para fora, apenas o domínio, e nada em
    // requisição insegura. Currículo é navegado com o endereço da vaga na URL:
    // mandar o caminho inteiro para terceiros vazaria contexto do usuário.
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    // Nada neste produto usa câmera, microfone, localização ou pagamento.
    // Desligar explicitamente impede que um script injetado tente.
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), interest-cohort=()',
  },
  {
    // Isola o contexto de navegação de janelas abertas por/para esta origem.
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin',
  },
  {
    // Recurso desta origem não pode ser incorporado por outro site.
    key: 'Cross-Origin-Resource-Policy',
    value: 'same-origin',
  },
];

/**
 * HSTS só em produção, e o motivo é prático: em desenvolvimento o app roda em
 * `http://localhost`, e um HSTS gravado para localhost faz o navegador recusar
 * http em TODO projeto local dali em diante — um estrago que dura até a pessoa
 * limpar o estado de segurança do navegador à mão.
 *
 * Dois anos, incluindo subdomínios. `preload` fica de fora de propósito: entrar
 * na lista embutida dos navegadores é praticamente irreversível, e essa é uma
 * decisão do dono do domínio, não do código.
 */
const HSTS = {
  key: 'Strict-Transport-Security',
  value: 'max-age=63072000; includeSubDomains',
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Não anuncia a tecnologia do servidor. Não impede ataque nenhum sozinho, mas
  // tira do atacante a lista de CVEs que vale a pena tentar primeiro.
  poweredByHeader: false,

  /**
   * Saída `standalone` só quando o build roda dentro do Dockerfile.
   *
   * Esse modo gera `.next/standalone` com um servidor Node autocontido e
   * apenas as dependências realmente usadas — é o que permite a imagem final
   * não carregar o `node_modules` inteiro.
   *
   * É CONDICIONAL de propósito: ligado sempre, mudaria a saída do
   * `npm run build` de todo mundo, inclusive na Vercel, que já sabe empacotar
   * sozinha. Um build de contêiner define BUILD_STANDALONE=1 e recebe o que
   * precisa; nenhum outro caminho muda.
   */
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,

  /**
   * Teto do corpo de uma Server Action.
   *
   * Existe pela importação de currículo: o padrão do Next é 1 MB, e uma FOTO de
   * celular passa disso sem esforço.
   *
   * O NÚMERO AQUI FICA ENTRE O NOSSO TETO E O DA PLATAFORMA. `MAX_UPLOAD_BYTES`
   * (em `src/lib/files/limits.ts`) é 4 MB e a Vercel corta em ~4,5 MB; este 4,4
   * MB fica no meio de propósito. Acima do nosso, para que quem recuse seja a
   * nossa validação — que explica o que fazer — e não o Next com um erro
   * genérico. Abaixo do da plataforma, porque passar disso não compraria nada:
   * o corte da borda acontece antes de o Next opinar.
   *
   * Já esteve em 10mb, o que era ficção: anunciava internamente o dobro do que
   * a plataforma jamais entregaria.
   */
  experimental: {
    serverActions: {
      bodySizeLimit: '4.4mb',
    },
  },

  async headers() {
    const producao = process.env.NODE_ENV === 'production';
    return [
      {
        source: '/:path*',
        headers: producao ? [...CABECALHOS, HSTS] : CABECALHOS,
      },
    ];
  },
};

export default nextConfig;
