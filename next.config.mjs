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
   * REQUISIÇÃO. `MAX_UPLOAD_BYTES` (em `src/lib/files/limits.ts`) é 8 MB, e
   * este 8,5 MB fica acima dele de propósito: assim, quem recusa um arquivo
   * grande demais é a NOSSA validação — que explica o que fazer — e não o
   * Next com um erro genérico de corpo excedido. A folga de meio megabyte é o
   * que cobre o envelope do `multipart/form-data`, que este campo mede junto
   * com o arquivo e a nossa validação não.
   *
   * QUEM CORTA NA OUTRA PONTA MUDOU COM O SERVIDOR PRÓPRIO, E ISSO IMPORTA.
   * Na Vercel, a borda da própria plataforma cortava o corpo da requisição em
   * ~4,5 MB antes de o Next sequer ser chamado — por isso este campo esteve
   * em 4,4 MB por muito tempo. Num servidor próprio quem fica na frente do
   * Next é um proxy reverso, e um Nginx tem teto próprio, `client_max_body_
   * size`, cujo PADRÃO DE FÁBRICA É 1 MB. Com esse padrão valendo, uma foto de
   * 2–4 MB receberia 413 do proxy antes de chegar ao Next e antes de qualquer
   * mensagem nossa — o mesmo sintoma do defeito antigo da Vercel (erro de rede
   * sem explicação), só que com a causa fora deste repositório.
   *
   * ESSE RISCO FOI MEDIDO, E NÃO SE CONFIRMA NESTE HOST. Em 28/08/2026 a
   * produção (`curriculoproia.online`, Web App Node.js da Hostinger) recebeu
   * POSTs de 1, 2, 3, 4, 5, 6, 8, 12 e 20 MB: todas as nove respostas foram o
   * 413 emitido pelo NOSSO código, nenhuma um 413 de proxy. 20 MB atravessam a
   * borda inteiros, então o `client_max_body_size` deste host não está no
   * padrão de fábrica. É o que libera o 8,5 MB deste campo.
   *
   * O QUE REFAZER SE A HOSPEDAGEM MUDAR: repetir a medida antes de confiar no
   * número. Um `curl -X POST` com corpo de 12 MB contra qualquer rota da API é
   * suficiente — se voltar um 413 que não seja JSON nosso, o corte é do proxy,
   * e aí `client_max_body_size` precisa subir para pelo menos 8,5 MB nos
   * `server`/`location` que servem `/app/curriculo/importar`. Nenhum teste
   * deste repositório cobre isso, porque vive fora dele.
   *
   * Já esteve em 10mb quando a Vercel entregava 4,5 MB, o que era ficção:
   * anunciava internamente o dobro do que chegava. A diferença entre aquele
   * 10mb e este 8,5mb não é o tamanho — é que este foi medido contra a borda
   * que está de fato no caminho.
   */
  experimental: {
    serverActions: {
      bodySizeLimit: '8.5mb',
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
