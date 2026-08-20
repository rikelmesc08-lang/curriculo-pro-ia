'use client';

import { cx } from '@/lib/utils';

/**
 * Indicador de progresso do fluxo de criação.
 *
 * No desktop mostra a trilha inteira. No celular mostra "Etapa 3 de 8" com uma
 * barra: oito rótulos espremidos numa tela de 360px viram ilegíveis, e a
 * informação que importa ali é quanto falta, não o nome de cada parada.
 */

export interface StepDefinition {
  id: string;
  label: string;
}

export function Stepper({
  steps,
  currentIndex,
  onSelect,
}: {
  steps: StepDefinition[];
  currentIndex: number;
  /** Permite voltar clicando. Etapas à frente ficam desabilitadas. */
  onSelect?: (index: number) => void;
}) {
  const total = steps.length;
  const current = steps[currentIndex];
  const percentage = Math.round(((currentIndex + 1) / total) * 100);

  return (
    <div>
      {/* Celular */}
      <div className="md:hidden">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-ink">{current?.label}</p>
          <p className="text-xs font-medium text-muted">
            Etapa {currentIndex + 1} de {total}
          </p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Desktop */}
      <ol className="hidden items-center gap-1 md:flex">
        {steps.map((step, index) => {
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
          const clickable = Boolean(onSelect) && index <= currentIndex;

          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center gap-1">
              <button
                type="button"
                disabled={!clickable}
                onClick={clickable ? () => onSelect?.(index) : undefined}
                aria-current={state === 'current' ? 'step' : undefined}
                className={cx(
                  'flex min-w-0 flex-1 flex-col gap-1.5 rounded-md px-1 py-1 text-left transition-colors',
                  clickable && 'hover:bg-brand-50',
                  !clickable && 'cursor-default'
                )}
              >
                <span
                  className={cx(
                    'h-1.5 w-full rounded-full',
                    state === 'todo' ? 'bg-line' : 'bg-brand-600'
                  )}
                />
                <span
                  className={cx(
                    'truncate text-xs font-medium',
                    state === 'current' ? 'text-brand-700' : state === 'done' ? 'text-ink-soft' : 'text-muted'
                  )}
                >
                  {index + 1}. {step.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
