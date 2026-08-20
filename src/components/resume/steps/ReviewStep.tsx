'use client';

import Link from 'next/link';
import { completeness } from '@/lib/resume/draft';
import { cx } from '@/lib/utils';
import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { TEMPLATES } from '../templates/definitions';
import { ResumeSheet } from '../ResumeSheet';
import { DownloadPdfButton } from '../DownloadPdfButton';
import type { StepProps } from '../types';

/**
 * Última etapa: escolher o modelo, conferir e baixar.
 *
 * O bloco de pendências vem ANTES do botão de download, e o download fica
 * bloqueado enquanto faltar algo essencial. Deixar baixar um currículo sem
 * telefone seria deixar a pessoa se candidatar com um documento que não tem
 * como gerar retorno.
 */
export function ReviewStep({ content, update }: StepProps) {
  const status = completeness(content);
  const blocked = status.missingEssentials.length > 0;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-ink">Escolha o modelo</h3>
        <p className="mt-0.5 text-xs text-muted">
          Todos são de coluna única, sem gráficos nem barras de habilidade — o formato que os
          sistemas de triagem conseguem ler.
        </p>

        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((template) => {
            const selected = content.template === template.id;
            return (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() => update((previous) => ({ ...previous, template: template.id }))}
                  aria-pressed={selected}
                  className={cx(
                    'flex h-full w-full flex-col rounded-lg border p-4 text-left transition-colors',
                    selected
                      ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
                      : 'border-line bg-surface hover:border-line-strong'
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{template.name}</span>
                    {selected && <Icon name="check" className="h-4 w-4 text-brand-600" strokeWidth={2.4} />}
                  </span>
                  <span className="mt-1.5 text-xs leading-relaxed text-muted">{template.description}</span>
                  <span className="mt-2 text-[11px] font-medium text-brand-700">{template.bestFor}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-ink">O que ainda falta</h3>
        <ul className="mt-3 space-y-2">
          {status.items.map((item) => (
            <li
              key={item.label}
              className={cx(
                'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm',
                item.done ? 'border-line bg-surface text-ink-soft' : 'border-line-strong bg-canvas'
              )}
            >
              <span
                className={cx(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                  item.done ? 'bg-success text-white' : 'border border-line-strong bg-surface'
                )}
                aria-hidden="true"
              >
                {item.done && (
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
                    <path d="m5 12.5 4.5 4.5L19 7" />
                  </svg>
                )}
              </span>
              <span className="min-w-0">
                <span className="font-medium text-ink">{item.label}</span>
                {item.essential && !item.done && (
                  <span className="ml-2 text-xs font-semibold text-danger">obrigatório</span>
                )}
                {!item.done && <span className="block text-xs text-muted">{item.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {blocked ? (
        <Alert tone="warning" title="Complete os campos obrigatórios para baixar">
          Faltam: {status.missingEssentials.map((item) => item.label).join(', ')}. Volte às etapas
          anteriores para preencher.
        </Alert>
      ) : (
        <Alert tone="success" title="Seu currículo está pronto para ser enviado">
          Confira a pré-visualização abaixo antes de baixar. O que você vê é exatamente o que sai no
          PDF.
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <DownloadPdfButton
          resume={content}
          disabled={blocked}
          disabledReason={blocked ? 'Preencha os campos obrigatórios acima.' : undefined}
        />
        <Link
          href="/app/analisar-vaga"
          className="text-sm font-semibold text-brand-700 hover:underline"
        >
          Adaptar este currículo para uma vaga →
        </Link>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-ink">Pré-visualização</h3>
        <div className="mt-3 rounded-card bg-canvas p-3 sm:p-5">
          <ResumeSheet resume={content} />
        </div>
      </section>
    </div>
  );
}
