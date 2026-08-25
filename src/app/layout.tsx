import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import { env, warnMissingSiteUrl } from '@/lib/env';
import { politicaMeta } from '@/lib/seguranca/csp';
import './globals.css';

/**
 * Layout raiz.
 *
 * `variable` em vez de `className` na fonte: o valor entra como custom
 * property e é consumido pelo token `--font-sans` em `globals.css`. Assim o
 * app inteiro referencia uma fonte só, definida num lugar só.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const SITE_NAME = 'CurrículoPro IA';
const DESCRIPTION =
  'Crie, otimize e adapte seu currículo para vagas de emprego usando inteligência artificial.';

// Lê pelo `env`, e não por `process.env` direto: era o único lugar do projeto
// que escapava do módulo, e por isso o único que não teria como avisar quando a
// variável faltasse.
warnMissingSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl()),
  title: {
    default: `${SITE_NAME} — Crie seu Currículo Profissional com Inteligência Artificial`,
    template: `%s — ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'currículo',
    'currículo com inteligência artificial',
    'modelo de currículo',
    'análise ATS',
    'carta de apresentação',
    'preparação para entrevista',
    'primeiro emprego',
    'estágio',
  ],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Seu currículo mais preparado para cada oportunidade`,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#2559eb',
  width: 'device-width',
  initialScale: 1,
};

/**
 * `async` e a leitura de `headers()` aqui são a mudança que força TODA rota a
 * renderizar dinamicamente (nonce é por requisição; página estática não tem
 * requisição). Medido antes desta mudança: `npm run build` já mostrava toda
 * página de HTML como `ƒ` (dinâmica) — inclusive a landing e as páginas
 * legais —, porque o cabeçalho de navegação chama `getSessionUser()`
 * (`src/lib/auth/session.ts`), que lê `cookies()`. Só `/_not-found` e os
 * arquivos de ícone/imagem (que não passam por este layout) eram estáticos, e
 * continuam sendo. Custo real desta mudança: zero rotas a mais viraram
 * dinâmicas. Tabela de antes/depois no commit que introduziu este comentário.
 */
export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const producao = process.env.NODE_ENV === 'production';
  // Mesmo nonce que o proxy carimbou nos scripts do Next (via `x-nonce`, lido
  // em `src/proxy.ts`) — sem isso, o `<meta>` abaixo teria um nonce diferente
  // do dos `<script>` da página, e todo script legítimo seria bloqueado.
  const nonce = (await headers()).get('x-nonce') ?? '';
  const cspMeta = politicaMeta(nonce, producao);

  return (
    <html lang="pt-BR" className={inter.variable}>
      <head>
        {/*
          É o ÚNICO filho deste <head> de propósito — entre o que nós
          escrevemos aqui, precisa ser o primeiro (e é: CSP entregue por
          <meta> só vale para o que o parser encontra depois dela).

          IMPORTANTE, e medido no HTML de verdade (`next start`, produção,
          25/08/2026), não deduzido: este <meta> NÃO é o primeiro elemento do
          <head> renderizado. Antes dele aparecem, nesta ordem: os dois
          `<meta>` que o Next emite sempre (charset, viewport), a folha de
          estilo e os `<script>` do bundle de hidratação (o próprio
          "document shell" do App Router — sai antes de QUALQUER filho do
          layout, inclusive antes da Metadata API), e depois os `<meta>`/
          `<title>`/`<link rel=icon>` resolvidos do `export const metadata`
          acima. Isso é arquitetura do Next 16 (React 19 hospeda recursos —
          script, link, style — no <head> na ordem em que são ENCONTRADOS
          durante a renderização, e o shell do framework e a Metadata API são
          resolvidos antes do <head> que este componente devolve), não uma
          falha de posicionamento nosso; não há como um <head> escrito à mão
          num Server Component furar essa fila.

          Por que isso ainda protege o que importa: tudo que aparece antes
          deste <meta> é conteúdo do BUILD — nomes de arquivo com hash,
          strings estáticas que nós escrevemos em `metadata`/`viewport` acima
          — nunca dado de requisição ou de usuário. O conteúdo que de fato
          pode carregar entrada hostil (formulários, texto de currículo,
          qualquer coisa vinda de `children`) mora inteiro dentro de <body>,
          depois de `</head>`, portanto depois deste <meta>.

          Risco residual real: se um dia alguma rota passar a usar
          `generateMetadata()` para refletir dado de requisição num `<meta>`
          ou `<title>` (hoje NENHUMA usa — todas exportam `metadata` como
          objeto estático; conferido em 25/08/2026), esse valor entraria no
          HTML antes desta política. Quem adicionar `generateMetadata()`
          dinâmico a uma rota precisa saber disso.

          Por que existe, apesar do cabeçalho HTTP já carregar a mesma
          política (`src/proxy.ts`): em produção na Hostinger, o CDN da
          plataforma (`hcdn`) substitui o cabeçalho `Content-Security-Policy`
          da resposta por `upgrade-insecure-requests` — confirmado com
          `curl -sS -D -` em 25/08/2026. O CDN reescreve cabeçalho, não corpo
          HTML, então o <meta> chega intacto onde o cabeçalho não chega. Nos
          outros ambientes (preview da Vercel, Docker) o cabeçalho já
          funciona; o <meta> aqui é redundância, não substituição.

          `politicaMeta()` (`src/lib/seguranca/csp.ts`) usa a MESMA lista de
          diretivas de `politica()`, com uma exceção: omite `frame-ancestors`,
          que a especificação marca como inválida dentro de <meta> (o
          navegador ignora e avisa no console). Isso não abre brecha de
          clickjacking: `X-Frame-Options: DENY`, em `next.config.mjs`, chega
          intacto na Hostinger (verificado no mesmo curl) e cobre esse caso
          para todo navegador que entende o cabeçalho.
        */}
        <meta httpEquiv="Content-Security-Policy" content={cspMeta} />
      </head>
      <body className="min-h-dvh antialiased">
        {/* Primeiro alvo do Tab: quem navega por teclado pula o menu inteiro. */}
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
