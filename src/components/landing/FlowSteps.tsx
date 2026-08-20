import { Icon } from '@/components/ui/Icon';
import { cx } from '@/lib/utils';

/**
 * Diagrama de fluxo em passos.
 *
 * Usado duas vezes na landing (a demonstração do hero e o "você não precisa
 * começar do zero"), com conteúdos diferentes. A seta vira para baixo no
 * celular e para o lado no desktop — empilhar quatro caixas com seta lateral
 * numa tela de 360px quebra a leitura.
 *
 * DUAS CORREÇÕES QUE VALE NÃO DESFAZER:
 *
 * 1. `min-w-0` nos itens flex. Sem isso, um item de flexbox se recusa a
 *    encolher abaixo da largura do próprio conteúdo (`min-width: auto` é o
 *    padrão), e as quatro caixas lado a lado estouravam a tela em 37px —
 *    rolagem horizontal na landing inteira, sem nenhum elemento aparentar
 *    ser largo demais.
 *
 * 2. A virada para linha acontece em `lg`, não em `md`. Em 768px as quatro
 *    caixas ficavam com ~170px cada, e o texto virava uma coluna de palavras
 *    soltas. Tablet lê melhor empilhado.
 */

export interface FlowStep {
  title: string;
  detail: string;
  /** Destaca o passo em que a IA age. */
  highlight?: boolean;
}

export function FlowSteps({ steps, className }: { steps: FlowStep[]; className?: string }) {
  return (
    <ol className={cx('flex flex-col gap-2 lg:flex-row lg:items-stretch', className)}>
      {steps.map((step, index) => (
        <li key={step.title} className="flex min-w-0 flex-1 flex-col lg:flex-row lg:items-center">
          <div
            className={cx(
              'min-w-0 flex-1 rounded-xl border p-4',
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
            <div className="flex items-center justify-center py-1 text-brand-400 lg:px-1.5 lg:py-0">
              <Icon name="seta-baixo" className="h-5 w-5 lg:hidden" />
              <Icon name="seta-direita" className="hidden h-5 w-5 lg:block" />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
