import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
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

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className={inter.variable}>
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
