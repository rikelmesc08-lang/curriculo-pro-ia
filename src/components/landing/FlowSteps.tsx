import { Icon } from '@/components/ui/Icon';
import { cx } from '@/lib/utils';

/**
 * Diagrama de fluxo em passos.
 *
 * Usado duas vezes na landing (a demonstração do hero e o "você não precisa
 * começar do zero"), com conteúdos diferentes. A seta vira para baixo no
 * celular e para o lado no desktop — empilhar quatro caixas com seta lateral
 * numa tela de 360px quebra a leitura.
 */

export interface FlowStep {
  title: string;
  detail: string;
  /** Destaca o passo em que a IA age. */
  highlight?: boolean;
}

export function FlowSteps({ steps, className }: { steps: FlowStep[]; className?: string }) {
  return (
    <ol className={cx('flex flex-col gap-2 md:flex-row md:items-stretch', className)}>
      {steps.map((step, index) => (
        <li key={step.title} className="flex flex-1 flex-col md:flex-row md:items-center">
          <div
            className={cx(
              'flex-1 rounded-xl border p-4',
              step.highlight
                ? 'border-brand-200 bg-brand-50'
                : 'border-line bg-surface'
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cx(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                  step.highlight ? 'bg-brand-600 text-white' : 'bg-canvas text-ink-soft'
                )}
              >
                {index + 1}
              </span>
              <p className={cx('text-sm font-semibold', step.highlight ? 'text-brand-900' : 'text-ink')}>
                {step.title}
              </p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{step.detail}</p>
          </div>

          {index < steps.length - 1 && (
            <div className="flex items-center justify-center py-1 text-brand-400 md:px-1.5 md:py-0">
              <Icon name="seta-baixo" className="h-5 w-5 md:hidden" />
              <Icon name="seta-direita" className="hidden h-5 w-5 md:block" />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
