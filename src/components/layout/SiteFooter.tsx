import Link from 'next/link';
import { Logo } from './Logo';

const YEAR = new Date().getFullYear();

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="container-page py-10">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Seu currículo mais preparado para cada oportunidade. A IA organiza e melhora o que
              você escreveu — ela não inventa experiência nenhuma.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <nav aria-label="Produto">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Produto</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/#recursos" className="text-ink-soft hover:text-brand-700">Recursos</Link></li>
                <li><Link href="/#como-funciona" className="text-ink-soft hover:text-brand-700">Como funciona</Link></li>
                <li><Link href="/#planos" className="text-ink-soft hover:text-brand-700">Planos</Link></li>
              </ul>
            </nav>

            <nav aria-label="Conta">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Conta</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/cadastro" className="text-ink-soft hover:text-brand-700">Criar conta</Link></li>
                <li><Link href="/login" className="text-ink-soft hover:text-brand-700">Entrar</Link></li>
                <li><Link href="/app" className="text-ink-soft hover:text-brand-700">Painel</Link></li>
              </ul>
            </nav>

            <nav aria-label="Legal">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Legal</h2>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link href="/privacidade" className="text-ink-soft hover:text-brand-700">Privacidade</Link></li>
                <li><Link href="/termos" className="text-ink-soft hover:text-brand-700">Termos de uso</Link></li>
              </ul>
            </nav>
          </div>
        </div>

        <p className="mt-8 border-t border-line pt-6 text-xs text-muted">
          © {YEAR} CurrículoPro IA. Os indicadores de compatibilidade e de ATS são estimativas
          baseadas nas informações que você fornece e não garantem contratação.
        </p>
      </div>
    </footer>
  );
}
