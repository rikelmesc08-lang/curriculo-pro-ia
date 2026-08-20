import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { cx } from '@/lib/utils';
import { Spinner } from './Spinner';

/**
 * Botão do produto, em duas formas: `<Button>` (ação) e `<ButtonLink>`
 * (navegação). São componentes separados de propósito — um `<a>` disfarçado de
 * botão quebra o Ctrl+clique, o "abrir em nova aba" e a leitura de tela.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800',
  secondary: 'bg-white text-ink border border-line-strong hover:bg-canvas hover:border-muted',
  ghost: 'bg-transparent text-ink-soft hover:bg-brand-50 hover:text-brand-700',
  danger: 'bg-white text-danger border border-danger/30 hover:bg-danger-soft',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'text-sm px-3 py-1.5',
  md: 'text-sm px-4 py-2.5',
  lg: 'text-base px-6 py-3.5',
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ocupa toda a largura — o padrão no celular, onde alvo grande importa. */
  block?: boolean;
  children: ReactNode;
  className?: string;
}

interface ButtonProps extends CommonProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> {
  /** Troca o conteúdo por um indicador e desabilita o clique. */
  loading?: boolean;
  /** Texto exibido durante o carregamento. Sem ele, mantém o rótulo original. */
  loadingLabel?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  loadingLabel,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      // `aria-busy` avisa o leitor de tela que a ação está em andamento; sem
      // isso o usuário cego só percebe que o botão parou de responder.
      aria-busy={loading || undefined}
      className={cx(base, variants[variant], sizes[size], block && 'w-full', className)}
    >
      {loading && <Spinner className={variant === 'primary' ? 'text-white' : 'text-brand-600'} />}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}

interface ButtonLinkProps extends CommonProps {
  href: string;
  target?: string;
  rel?: string;
  prefetch?: boolean;
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      {...rest}
      className={cx(base, variants[variant], sizes[size], block && 'w-full', className)}
    >
      {children}
    </Link>
  );
}
