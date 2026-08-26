/**
 * Cabeçalhos de segurança que valem para TODA resposta.
 *
 * A Content-Security-Policy NÃO está aqui: ela carrega um nonce por requisição
 * e é montada em `src/lib/seguranca/csp.ts`, entregue por `src/proxy.ts` (no
 * cabeçalho) e por `src/app/layout.tsx` (num `<meta>`, que sobrevive ao CDN da
 * Hostinger reescrevendo o cabeçalho). O que fica neste arquivo é o conjunto
 * fixo, que também precisa cobrir os arquivos estáticos — e esses não passam
 * pelo proxy.
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
   * O NÚMERO AQUI FICA ENTRE O NOSSO TETO E O DA BORDA QUE RECEBE A
   * REQUISIÇÃO. `MAX_UPLOAD_BYTES` (em `src/lib/files/limits.ts`) é 4 MB, e
   * este 4,4 MB fica acima dele de propósito: assim, quem recusa um arquivo
   * grande demais é a NOSSA validação — que explica o que fazer — e não o
   * Next com um erro genérico de corpo excedido.
   *
   * QUEM CORTA NA OUTRA PONTA MUDOU COM O SERVIDOR PRÓPRIO, E ISSO IMPORTA.
   * Na Vercel, a borda da própria plataforma cortava o corpo da requisição em
   * ~4,5 MB antes de o Next sequer ser chamado — por isso o 4,4 MB deste
   * campo sempre coube dentro do que chegava. Num servidor próprio (VPS na
   * Hostinger) quem fica na frente do Next é um proxy reverso — Nginx, no
   * caminho documentado deste projeto — e o Nginx tem TETO PRÓPRIO, `client_
   * max_body_size`, cujo PADRÃO DE FÁBRICA É 1 MB.
   *
   * ISSO É UMA ARMADILHA REAL, não teórica: com Nginx no padrão, uma foto de
   * 2–4 MB (o caso de uso que este limite existe para atender — ver o
   * histórico em `src/lib/files/limits.ts`) recebe 413 Request Entity Too
   * Large do Nginx, antes de chegar ao Next e antes de qualquer mensagem
   * nossa aparecer. O sintoma bate exatamente com o defeito antigo da Vercel
   * que este arquivo já teve de corrigir — erro de rede sem explicação —, só
   * que a causa agora está na configuração do servidor, não neste número.
   *
   * `client_max_body_size` do Nginx PRECISA ficar em pelo menos 4,4 MB nos
   * hosts (`server`/`location`) que servem `/app/curriculo/importar` e
   * quaisquer outras rotas de upload deste projeto — ideal um pouco acima,
   * pelo mesmo raciocínio de folga que já vale entre `MAX_UPLOAD_BYTES` e
   * este campo. Isto não é validado por teste nenhum deste repositório
   * porque vive fora dele, na configuração do proxy do VPS; documentar aqui é
   * a defesa possível contra o esquecimento.
   *
   * O NÚMERO 4,4 MB EM SI NÃO MUDOU E NÃO PRECISA MUDAR: ele já ficava entre
   * `MAX_UPLOAD_BYTES` (4 MB) e qualquer corte de borda razoável — só o motivo
   * documentado do lado de fora mudou de plataforma para proxy.
   *
   * Já esteve em 10mb, o que era ficção: anunciava internamente o dobro do que
   * a Vercel jamais entregava — o mesmo tipo de erro que um Nginx mal
   * configurado reintroduziria hoje, só que na direção contrária (proxy corta
   * menos do que anunciamos suportar).
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
