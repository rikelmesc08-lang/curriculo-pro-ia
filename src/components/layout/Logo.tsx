import Link from 'next/link';
import { cx } from '@/lib/utils';

/**
 * Marca do produto.
 *
 * Um documento com uma seta subindo: currículo e progressão de carreira. SVG
 * inline em vez de arquivo de imagem porque ele herda a cor do texto — o mesmo
 * componente serve no cabeçalho claro e num fundo escuro sem uma segunda arte.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cx('h-7 w-7', className)} aria-hidden="true">
      <rect x="4" y="2" width="20" height="28" rx="4" className="fill-brand-600" />
      <path d="M9 9h10M9 14h10M9 19h5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="23" cy="22" r="7.5" className="fill-brand-900" />
      <path d="M20 23.5l2.5 2.5 4-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cx('flex items-center gap-2.5 font-bold text-ink', className)}>
      <LogoMark />
      <span className="text-[17px] tracking-tight">
        Currículo<span className="text-brand-600">Pro</span> IA
      </span>
    </Link>
  );
}
