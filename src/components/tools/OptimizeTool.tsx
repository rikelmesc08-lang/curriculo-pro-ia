'use client';

import { useCallback, useState, useTransition } from 'react';
import { optimizeResumeAction } from '@/server/actions/ai';
import { applyOptimizationAction } from '@/server/actions/resume';
import { useAiAction } from '@/hooks/useAiAction';
import { useJobDescription } from '@/hooks/useJobDescription';
import { RESUME_VARIANTS, type Resume, type ResumeVariant } from '@/types/resume';
import { toContent } from '@/lib/resume/draft';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { SelectField } from '@/components/ui/Field';
import { AiResultPanel } from '@/components/ai/AiResultPanel';
import { IntegrityNote } from '@/components/ai/AiNotices';
import { ResumeSheet } from '@/components/resume/ResumeSheet';
import { DownloadPdfButton } from '@/components/resume/DownloadPdfButton';
import { ChipList, JobDescriptionInput } from './ToolPieces';

/**
 * Otimizador do currículo para uma vaga.
 *
 * O resultado NÃO substitui o currículo automaticamente. Ele aparece como
 * proposta, com pré-visualização lado a lado, e só entra no documento se a
 * pessoa clicar em aplicar. Sobrescrever o trabalho de alguém com texto gerado
 * — ainda mais texto que ela vai levar para uma entrevista — sem confirmação
 * seria inaceitável.
 *
 * A pré-visualização mostra o currículo JÁ com a proposta aplicada, sem gravar
 * nada: é a única forma de a pessoa julgar o resultado antes de decidir.
 */
export function OptimizeTool({ resume }: { resume: Resume }) {
  const { jobDescription, setJobDescription } = useJobDescription();
  const optimize = useAiAction(optimizeResumeAction);
  const [variant, setVariant] = useState<ResumeVariant>(resume.variant);
  const [applying, startApplying] = useTransition();
  const [applied, setApplied] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const base = toContent(resume);
  const tooShort = jobDescription.trim().length < 40;

  const run = useCallback(() => {
    setApplied(false);
    setApplyError(null);
    optimize.run({ ...base, variant }, jobDescription);
  }, [optimize, base, variant, jobDescription]);

  const proposal = optimize.data?.data;

  /** Currículo como ficaria com a proposta aplicada. Nada é gravado aqui. */
  const preview = proposal
    ? {
        ...base,
        variant,
        goal: { ...base.goal, summary: proposal.summary || base.goal.summary },
        experiences: base.experiences.map((experience) => {
          const change = proposal.experiences.find((item) => item.id === experience.id);
          return change
            ? {
                ...experience,
                description: change.description,
                responsibilities: change.responsibilities,
                achievements: change.achievements,
              }
            : experience;
        }),
        skills: [...base.skills].sort((a, b) => {
          const order = proposal.skillsOrder.map((name) => name.toLowerCase());
          const left = order.indexOf(a.name.toLowerCase());
          const right = order.indexOf(b.name.toLowerCase());
          return (left === -1 ? Number.MAX_SAFE_INTEGER : left) - (right === -1 ? Number.MAX_SAFE_INTEGER : right);
        }),
      }
    : null;

  function apply() {
    if (!proposal) return;
    setApplyError(null);
    startApplying(async () => {
      const result = await applyOptimizationAction(resume.id, {
        summary: proposal.summary,
        experiences: proposal.experiences,
        skillsOrder: proposal.skillsOrder,
      });
      if (result.ok) setApplied(true);
      else setApplyError(result.error);
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Otimizar meu currículo"
          description="A IA reescreve seus textos com foco nesta vaga. Ela não altera empresa, cargo, datas nem acrescenta competência que você não cadastrou."
        />
        <CardBody className="space-y-4">
          <SelectField
            label="Versão do currículo"
            value={variant}
            onChange={(event) => setVariant(event.target.value as ResumeVariant)}
            options={RESUME_VARIANTS.map((item) => ({ value: item.id, label: item.label }))}
            hint="Muda o recorte e a ordem das seções. Os fatos continuam os mesmos."
          />

          <JobDescriptionInput value={jobDescription} onChange={setJobDescription} rows={8} />

          <Button
            type="button"
            onClick={run}
            disabled={tooShort}
            loading={optimize.pending}
            loadingLabel="Otimizando..."
            className="uppercase tracking-wide"
          >
            Otimizar meu currículo
          </Button>

          {tooShort && jobDescription.length > 0 && (
            <Alert tone="warning">Cole a descrição completa da vaga para a adaptação fazer sentido.</Alert>
          )}

          <IntegrityNote />
        </CardBody>
      </Card>

      {(optimize.pending || optimize.error || optimize.data) && (
        <Card>
          <CardHeader title="Proposta da IA" />
          <CardBody>
            <AiResultPanel
              pending={optimize.pending}
              error={optimize.error}
              mode={optimize.data?.mode}
              notice={optimize.data?.notice}
              hasResult={Boolean(proposal)}
              onRetry={run}
              pendingMessage="Reescrevendo seus textos com foco na vaga..."
              emptyMessage="Cole a vaga e clique em otimizar."
            >
              {proposal && preview && (
                <div className="space-y-5">
                  {applied && (
                    <Alert tone="success" title="Aplicado no seu currículo">
                      As alterações foram salvas. Você ainda pode editar tudo manualmente.
                    </Alert>
                  )}
                  {applyError && <Alert tone="danger">{applyError}</Alert>}

                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      Resumo profissional proposto
                    </h3>
                    <p className="whitespace-pre-wrap rounded-lg border border-line bg-canvas p-3.5 text-sm leading-relaxed text-ink">
                      {proposal.summary || 'Sem alteração no resumo.'}
                    </p>
                  </section>

                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      Palavras-chave aproveitadas
                    </h3>
                    <ChipList items={proposal.keywordsUsed} tone="brand" />
                  </section>

                  {proposal.notes.length > 0 && (
                    <Alert tone="info" title="Observações">
                      <ul className="space-y-1">
                        {proposal.notes.map((note, index) => (
                          <li key={`${note}-${index}`}>• {note}</li>
                        ))}
                      </ul>
                    </Alert>
                  )}

                  <div className="flex flex-wrap gap-3 border-t border-line pt-4">
                    <Button type="button" onClick={apply} loading={applying} loadingLabel="Aplicando...">
                      Aplicar no meu currículo
                    </Button>
                    <DownloadPdfButton resume={preview} />
                    <ButtonLink href="/app/curriculo" variant="ghost">
                      Editar manualmente
                    </ButtonLink>
                  </div>

                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      Como ficaria
                    </h3>
                    <div className="rounded-card bg-canvas p-3 sm:p-5">
                      <ResumeSheet resume={preview} />
                    </div>
                  </section>
                </div>
              )}
            </AiResultPanel>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
