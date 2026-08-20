import type { ReactNode } from 'react';
import { cx } from '@/lib/utils';

/** Tons semânticos compartilhados por Badge e Alert. */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const badgeTones: Record<Tone, string> = {
  neutral: 'bg-canvas text-ink-soft border-line-strong',
  info: 'bg-info-soft text-info border-brand-200',
  success: 'bg-success-soft text-success border-success/20',
  warning: 'bg-warning-soft text-warning border-warning/20',
  danger: 'bg-danger-soft text-danger border-danger/20',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        badgeTones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

const alertTones: Record<Tone, string> = {
  neutral: 'bg-canvas border-line text-ink-soft',
  info: 'bg-info-soft border-brand-200 text-brand-900',
  success: 'bg-success-soft border-success/20 text-success',
  warning: 'bg-warning-soft border-warning/20 text-warning',
  danger: 'bg-danger-soft border-danger/20 text-danger',
};

/**
 * Aviso em bloco.
 *
 * `role="alert"` só quando o tom é de erro: esse papel interrompe a leitura de
 * tela na hora. Usar em toda mensagem transformaria um aviso informativo numa
 * interrupção — e, com o tempo, o usuário ignora todas.
 */
export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={cx('rounded-lg border px-4 py-3 text-sm', alertTones[tone], className)}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cx(title && 'mt-1', 'leading-relaxed')}>{children}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
