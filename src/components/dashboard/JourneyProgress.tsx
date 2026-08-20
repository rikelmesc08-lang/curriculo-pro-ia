import Link from 'next/link';
import { cx } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';

/**
 * A jornada completa, do formulário ao PDF.
 *
 * As quatro primeiras etapas são MEDIDAS a partir do currículo salvo. As
 * quatro últimas dependem de ações que acontecem fora do banco (colar uma
 * vaga, gerar uma otimização, revisar, baixar) e por isso aparecem como
 * próximos passos, nunca marcadas como concluídas.
 *
 * Marcar "Download" como feito porque a pessoa passou pela tela seria mentir
 * para ela sobre o próprio progresso — e é o tipo de indicador que faz alguém
 * parar de olhar para a barra.
 */
export interface JourneyStep {
  label: string;
  href: string;
  done?: boolean;
  measured: boolean;
}

export function JourneyProgress({ steps }: { steps: JourneyStep[] }) {
  const measured = steps.filter((step) => step.measured);
  const doneCount = measured.filter((step) => step.done).length;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Sua jornada</h2>
        <p className="text-xs text-muted">
          {doneCount} de {measured.length} etapas do currículo concluídas
        </p>
      </div>

      <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => (
          <li key={step.label}>
            <Link
              href={step.href}
              className={cx(
                'flex h-full items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors',
                step.done
                  ? 'border-success/20 bg-success-soft'
                  : step.measured
                    ? 'border-line-strong bg-surface hover:border-brand-300'
                    : 'border-dashed border-line-strong bg-surface hover:border-brand-300'
              )}
            >
              <span
                className={cx(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                  step.done ? 'bg-success text-white' : 'bg-canvas text-muted'
                )}
              >
                {step.done ? <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className={cx('block truncate text-sm font-medium', step.done ? 'text-success' : 'text-ink')}>
                  {step.label}
                </span>
                {!step.measured && <span className="block text-[11px] text-muted">próximo passo</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
