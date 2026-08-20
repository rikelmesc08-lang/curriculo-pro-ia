import { cx } from '@/lib/utils';

/**
 * Indicador de carregamento.
 *
 * `aria-hidden` porque quem anuncia o estado é o `aria-busy` do elemento que
 * está carregando. Sem isso, o leitor de tela lê um ícone decorativo e não a
 * informação útil.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx('h-4 w-4 shrink-0 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Placeholder de bloco enquanto o conteúdo carrega. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-line', className)} aria-hidden="true" />;
}
