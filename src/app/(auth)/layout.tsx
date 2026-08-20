import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';

/**
 * Layout das telas de login e cadastro.
 *
 * Sem o cabeçalho completo do site: numa tela cujo único objetivo é entrar, um
 * menu com cinco links é distração. Fica só a marca (que volta para a home) e
 * os links legais.
 */
export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="container-page flex h-16 items-center">
          <Logo />
        </div>
      </header>

      <main id="conteudo" className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="border-t border-line bg-surface py-5">
        <div className="container-page flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted">
          <Link href="/privacidade" className="hover:text-brand-700">Política de privacidade</Link>
          <Link href="/termos" className="hover:text-brand-700">Termos de uso</Link>
          <Link href="/" className="hover:text-brand-700">Voltar ao início</Link>
        </div>
      </footer>
    </div>
  );
}
