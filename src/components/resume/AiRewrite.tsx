'use client';

import { useCallback, type ReactNode } from 'react';
import { improveExperienceAction, improveSummaryAction } from '@/server/actions/ai';
import { useAiAction } from '@/hooks/useAiAction';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { AiModeBadge } from '@/components/ai/AiNotices';
import type { ResumeContent } from '@/types/resume';

/**
 * Botões "melhorar com IA" do formulário.
 *
 * A REGRA DE OURO DESTA TELA: a IA propõe, o usuário decide. O texto sugerido
 * aparece num painel separado, ao lado do original, com "Aplicar" e
 * "Descartar". Nada é escrito no campo sem clique explícito.
 *
 * Isso não é preciosismo de UX — é o que impede a pessoa de enviar para uma
 * vaga um texto que ela nunca leu.
 */

function ProposalShell({
  pending,
  error,
  onRetry,
  onDiscard,
  onApply,
  mode,
  notice,
  changes,
  children,
}: {
  pending: boolean;
  error: string | null;
  onRetry: () => void;
  onDiscard: () => void;
  onApply?: () => void;
  mode?: 'real' | 'demo';
  notice?: string;
  changes?: string[];
  children?: ReactNode;
}) {
  if (pending) {
    return (
      <div className="rounded-lg border border-brand-200 bg-brand-50 p-4" aria-live="polite" aria-busy="true">
        <p className="text-sm font-medium text-brand-900">Reescrevendo com base no que você escreveu...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert tone="danger" title="Não deu para melhorar agora">
        <p>{error}</p>
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            Tentar de novo
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
            Fechar
          </Button>
        </div>
      </Alert>
    );
  }

  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-brand-900">Sugestão da IA</p>
        {mode && <AiModeBadge mode={mode} />}
      </div>

      {notice && (
        <p className="mt-2 rounded-md bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning">
          {notice}
        </p>
      )}

      <div className="mt-3">{children}</div>

      {changes && changes.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">O que mudou</p>
          <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-ink-soft">
            {changes.map((change) => (
              <li key={change} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{change}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {onApply && (
          <Button type="button" size="sm" onClick={onApply}>
            Aplicar no currículo
          </Button>
        )}
        <Button type="button" size="sm" variant="secondary" onClick={onDiscard}>
          Descartar
        </Button>
      </div>
    </div>
  );
}

export function SummaryRewrite({
  content,
  jobDescription,
  onApply,
}: {
  content: ResumeContent;
  jobDescription: string;
  onApply: (text: string) => void;
}) {
  const { data, error, pending, run, reset } = useAiAction(improveSummaryAction);
  const start = useCallback(() => run(content, jobDescription), [run, content, jobDescription]);

  if (!data && !pending && !error) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={start}>
        <Icon name="brilho" className="h-4 w-4 text-brand-600" />
        Melhorar meu resumo com IA
      </Button>
    );
  }

  const suggestion = data?.data.text ?? '';

  return (
    <ProposalShell
      pending={pending}
      error={error}
      onRetry={start}
      onDiscard={reset}
      onApply={suggestion ? () => { onApply(suggestion); reset(); } : undefined}
      mode={data?.mode}
      notice={data?.notice}
      changes={data?.data.changes}
    >
      {suggestion ? (
        <p className="whitespace-pre-wrap rounded-md border border-brand-200 bg-surface p-3 text-sm leading-relaxed text-ink">
          {suggestion}
        </p>
      ) : (
        <p className="rounded-md border border-warning/20 bg-warning-soft p-3 text-sm leading-relaxed text-warning">
          Não há texto suficiente para melhorar. Escreva algumas linhas primeiro — a IA reescreve o
          que você forneceu, ela não inventa a sua trajetória.
        </p>
      )}
    </ProposalShell>
  );
}

export function ExperienceRewrite({
  content,
  experienceId,
  jobDescription,
  onApply,
}: {
  content: ResumeContent;
  experienceId: string;
  jobDescription: string;
  onApply: (value: { description: string; responsibilities: string[]; achievements: string[] }) => void;
}) {
  const { data, error, pending, run, reset } = useAiAction(improveExperienceAction);
  const start = useCallback(
    () => run(content, experienceId, jobDescription),
    [run, content, experienceId, jobDescription]
  );

  if (!data && !pending && !error) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={start}>
        <Icon name="brilho" className="h-4 w-4 text-brand-600" />
        Melhorar descrição com IA
      </Button>
    );
  }

  const proposal = data?.data;

  return (
    <ProposalShell
      pending={pending}
      error={error}
      onRetry={start}
      onDiscard={reset}
      onApply={
        proposal
          ? () => {
              onApply({
                description: proposal.description,
                responsibilities: proposal.responsibilities,
                achievements: proposal.achievements,
              });
              reset();
            }
          : undefined
      }
      mode={data?.mode}
      notice={data?.notice}
      changes={proposal?.changes}
    >
      {proposal && (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">Descrição</p>
            <p className="mt-1 whitespace-pre-wrap rounded-md border border-brand-200 bg-surface p-3 text-sm leading-relaxed text-ink">
              {proposal.description || '(vazia)'}
            </p>
          </div>

          {proposal.responsibilities.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">Responsabilidades</p>
              <ul className="mt-1 space-y-1 rounded-md border border-brand-200 bg-surface p-3 text-sm text-ink">
                {proposal.responsibilities.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex gap-2">
                    <span aria-hidden="true">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">Resultados</p>
            {proposal.achievements.length > 0 ? (
              <ul className="mt-1 space-y-1 rounded-md border border-brand-200 bg-surface p-3 text-sm text-ink">
                {proposal.achievements.map((item, index) => (
                  <li key={`${item}-${index}`} className="flex gap-2">
                    <span aria-hidden="true">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 rounded-md border border-line bg-surface p-3 text-sm leading-relaxed text-muted">
                Nenhum resultado foi criado, porque você não informou nenhum. Se tiver um número
                real — meta batida, volume atendido, prazo reduzido — escreva no campo de resultados
                e peça a melhoria de novo.
              </p>
            )}
          </div>
        </div>
      )}
    </ProposalShell>
  );
}
