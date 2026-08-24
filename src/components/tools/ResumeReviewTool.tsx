'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { resumeReviewAction } from '@/server/actions/ai';
import { applyOptimizationAction } from '@/server/actions/resume';
import { useAiAction } from '@/hooks/useAiAction';
import { useJobDescription } from '@/hooks/useJobDescription';
import { track } from '@/lib/analytics/track';
import { toContent } from '@/lib/resume/draft';
import { REVIEW_DISCLAIMER, type ResumeReview, type ResumeReviewPreview } from '@/types/ai';
import type { Resume } from '@/types/resume';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { ScoreBar, ScoreRing } from '@/components/ui/Score';
import { AiResultPanel } from '@/components/ai/AiResultPanel';
import { IntegrityNote } from '@/components/ai/AiNotices';
import { ResumeSheet } from '@/components/resume/ResumeSheet';
import { DownloadPdfButton } from '@/components/resume/DownloadPdfButton';
import { DownloadDiagnosticButton } from '@/components/resume/DownloadDiagnosticButton';
import { ChipList, JobDescriptionInput } from './ToolPieces';

/**
 * Análise completa do currículo.
 *
 * É a porta de entrada do produto: uma chamada de IA responde "como está meu
 * currículo, o que está errado, e como ficaria melhor". As ferramentas
 * separadas continuam existindo para quem quer só uma delas.
 *
 * O COMPONENTE NÃO DECIDE O QUE MOSTRAR — ele desenha o que recebeu. Quem corta
 * entre prévia e resultado completo é o servidor (`review-gate.ts`), e por isso
 * esta tela trata `access: 'previa'` e `access: 'completo'` como dois conteúdos
 * diferentes, não como o mesmo conteúdo com um `if` de exibição. Se o corte
 * fosse aqui, o texto pago já estaria no navegador de quem não pagou.
 */
export function ResumeReviewTool({ resume }: { resume: Resume }) {
  const { jobDescription, setJobDescription } = useJobDescription();
  const review = useAiAction(resumeReviewAction);

  const base = toContent(resume);
  const delivery = review.data?.data;

  const run = useCallback(() => {
    review.run(base, jobDescription);
  }, [review, base, jobDescription]);

  useEffect(() => {
    if (review.data) {
      track('resume_review', {
        modo: review.data.mode,
        pontuacao:
          review.data.data.access === 'completo'
            ? review.data.data.review.score
            : review.data.data.preview.score,
        acesso: review.data.data.access,
      });
    }
  }, [review.data]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Analisar meu currículo"
          description="Um diagnóstico completo — clareza, organização, erros, palavras-chave e compatibilidade com ATS — mais a versão reescrita do seu texto."
        />
        <CardBody className="space-y-4">
          <JobDescriptionInput
            value={jobDescription}
            onChange={setJobDescription}
            label="Vaga de referência (opcional)"
            hint="A análise funciona sem isto. Com a vaga colada, ela também mede a aderência aos termos que a empresa usa."
            rows={6}
          />

          <Button
            type="button"
            onClick={run}
            loading={review.pending}
            loadingLabel="Analisando seu currículo..."
            className="uppercase tracking-wide"
          >
            Analisar meu currículo
          </Button>

          <IntegrityNote />
        </CardBody>
      </Card>

      {(review.pending || review.error || review.data) && (
        <Card>
          <CardHeader title="Resultado da análise" />
          <CardBody>
            <AiResultPanel
              pending={review.pending}
              error={review.error}
              mode={review.data?.mode}
              notice={review.data?.notice}
              cached={review.data?.cached}
              hasResult={Boolean(delivery)}
              onRetry={run}
              pendingMessage="Lendo seu currículo inteiro e avaliando cada seção..."
              emptyMessage="Clique em analisar para começar."
            >
              {delivery?.access === 'previa' && <PreviewResult preview={delivery.preview} />}
              {delivery?.access === 'completo' && (
                <FullResult review={delivery.review} resume={resume} onReanalyze={run} />
              )}
            </AiResultPanel>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Peças compartilhadas pelos dois modos
// ---------------------------------------------------------------------------

/**
 * O par de números: onde o currículo está e onde ele chega.
 *
 * A diferença entre os dois é a "indicação de quanto dá para melhorar" — e ela
 * vem com a ressalva colada, não escondida no rodapé. Um número solto numa tela
 * de emprego é lido como probabilidade de ser contratado, e não é isso que ele
 * mede.
 */
function ScoreHeader({ score, potential }: { score: number; potential: number }) {
  const gain = Math.max(potential - score, 0);

  return (
    <section className="rounded-card border border-line bg-canvas p-5">
      <div className="flex flex-wrap items-center justify-center gap-8 sm:justify-start">
        <ScoreRing value={score} caption="Seu currículo hoje" />
        {gain > 0 && (
          <>
            <Icon name="seta-direita" className="hidden h-6 w-6 text-muted sm:block" />
            <ScoreRing value={potential} caption="Depois das correções" />
          </>
        )}
      </div>

      {gain > 0 && (
        <p className="mt-4 text-center text-sm leading-relaxed text-ink-soft sm:text-left">
          Aplicando o que está apontado abaixo, seu currículo sobe{' '}
          <strong className="font-semibold text-ink">{gain} pontos</strong>.
        </p>
      )}

      <p className="mt-3 text-xs leading-relaxed text-muted">{REVIEW_DISCLAIMER}</p>
    </section>
  );
}

function Dimensions({ dimensions }: { dimensions: ResumeReview['dimensions'] }) {
  if (dimensions.length === 0) return null;
  return (
    <Block title="Nota por dimensão">
      <div className="grid gap-4 sm:grid-cols-2">
        {dimensions.map((dimension) => (
          <ScoreBar
            key={dimension.id}
            label={dimension.label}
            value={dimension.score}
            comment={dimension.comment}
          />
        ))}
      </div>
    </Block>
  );
}

const SEVERITY_TONE = {
  alta: 'danger',
  media: 'warning',
  baixa: 'neutral',
} as const;

const SEVERITY_LABEL = {
  alta: 'Grave',
  media: 'Médio',
  baixa: 'Leve',
} as const;

function IssueList({ issues }: { issues: ResumeReview['issues'] }) {
  if (issues.length === 0) {
    return <p className="text-sm text-muted">Nenhum problema encontrado nesta verificação.</p>;
  }

  return (
    <ul className="space-y-3">
      {issues.map((issue, index) => (
        <li key={`${issue.where}-${index}`} className="rounded-lg border border-line bg-canvas p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={SEVERITY_TONE[issue.severity]}>{SEVERITY_LABEL[issue.severity]}</Badge>
            <span className="text-sm font-semibold text-ink">{issue.where}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">{issue.problem}</p>
          <p className="mt-2 flex gap-2 text-sm leading-relaxed text-ink">
            <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={2.2} />
            <span>{issue.fix}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">Nada a destacar aqui.</p>;
  return (
    <ul className="space-y-1.5 text-sm leading-relaxed text-ink-soft">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2">
          <span className="text-muted">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Prévia gratuita
// ---------------------------------------------------------------------------

/**
 * O que quem não desbloqueou recebe.
 *
 * A prévia é útil sozinha, de propósito: nota, as oito dimensões medidas, os
 * pontos fortes e os problemas mais graves COM a correção junto. Cobrar pelo
 * diagnóstico e entregar só um cadeado deixaria a pessoa sem nada — e ela está
 * procurando emprego, não comprando um brinde.
 *
 * O que fica atrás do CTA é o TRABALHO PRONTO: o currículo reescrito inteiro e
 * o download dele.
 */
function PreviewResult({ preview }: { preview: ResumeReviewPreview }) {
  const { hidden } = preview;

  return (
    <div className="space-y-6">
      <ScoreHeader score={preview.score} potential={preview.potentialScore} />

      <Dimensions dimensions={preview.dimensions} />

      {preview.strengths.length > 0 && (
        <Block title="Pontos fortes">
          <Bullets items={preview.strengths} />
        </Block>
      )}

      <Block
        title={
          hidden.issues > 0
            ? `Problemas encontrados (${preview.issues.length} de ${preview.issues.length + hidden.issues})`
            : 'Problemas encontrados'
        }
      >
        <IssueList issues={preview.issues} />
      </Block>

      {preview.summaryPreview && (
        <Block title="Prévia do seu resumo profissional reescrito">
          <div className="relative overflow-hidden rounded-lg border border-line bg-canvas p-4">
            <p className="text-sm leading-relaxed text-ink">{preview.summaryPreview}</p>
            {/* Degradê no fim do trecho: deixa visível que o texto continua, em
                vez de parecer que o parágrafo simplesmente acabou ali. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-canvas to-transparent" />
          </div>
        </Block>
      )}

      <section className="rounded-card border-2 border-brand-200 bg-brand-50 p-5 text-center">
        <Icon name="brilho" className="mx-auto h-7 w-7 text-brand-600" />
        <h3 className="mt-2.5 text-lg font-bold text-ink">Seu currículo otimizado está pronto.</h3>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
          A versão reescrita já foi gerada e está guardada. Desbloqueie para ver o texto completo,
          aplicar no seu currículo e baixar em PDF.
        </p>

        <ul className="mx-auto mt-4 grid max-w-md gap-2 text-left text-sm text-ink-soft">
          {[
            hidden.rewrittenExperiences > 0 &&
              `${hidden.rewrittenExperiences} ${hidden.rewrittenExperiences === 1 ? 'experiência reescrita' : 'experiências reescritas'}`,
            hidden.issues > 0 && `mais ${hidden.issues} ${hidden.issues === 1 ? 'problema apontado' : 'problemas apontados'}`,
            hidden.recommendations > 0 &&
              `${hidden.recommendations} ${hidden.recommendations === 1 ? 'recomendação específica' : 'recomendações específicas'}`,
            hidden.opportunities > 0 &&
              `${hidden.opportunities} ${hidden.opportunities === 1 ? 'oportunidade de melhoria' : 'oportunidades de melhoria'}`,
            'download do currículo otimizado em PDF',
          ]
            .filter((item): item is string => typeof item === 'string')
            .map((item) => (
              <li key={item} className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={2.2} />
                <span>{item}</span>
              </li>
            ))}
        </ul>

        <ButtonLink href="/app/upgrade" className="mt-5 uppercase tracking-wide">
          Desbloquear currículo otimizado
        </ButtonLink>

        <p className="mt-3 text-xs leading-relaxed text-muted">
          Seu currículo continua seu: você pode editá-lo e baixá-lo em PDF a qualquer momento, de
          graça, na tela{' '}
          <a href="/app/curriculo" className="underline">
            Meu currículo
          </a>
          .
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resultado completo
// ---------------------------------------------------------------------------

function FullResult({
  review,
  resume,
  onReanalyze,
}: {
  review: ResumeReview;
  resume: Resume;
  onReanalyze: () => void;
}) {
  const [applying, startApplying] = useTransition();
  const [applied, setApplied] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const base = toContent(resume);

  /**
   * O currículo como ficaria com a proposta aplicada. Nada é gravado aqui.
   *
   * As experiências são casadas por `id`: uma que o modelo tenha inventado
   * simplesmente não encontra par e some da pré-visualização, do mesmo jeito que
   * o servidor a descarta ao aplicar.
   */
  const preview = {
    ...base,
    goal: { ...base.goal, summary: review.optimized.summary || base.goal.summary },
    experiences: base.experiences.map((experience) => {
      const change = review.optimized.experiences.find((item) => item.id === experience.id);
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
      const order = review.optimized.skillsOrder.map((name) => name.toLowerCase());
      const left = order.indexOf(a.name.toLowerCase());
      const right = order.indexOf(b.name.toLowerCase());
      return (
        (left === -1 ? Number.MAX_SAFE_INTEGER : left) - (right === -1 ? Number.MAX_SAFE_INTEGER : right)
      );
    }),
  };

  function apply() {
    setApplyError(null);
    startApplying(async () => {
      const result = await applyOptimizationAction(resume.id, {
        summary: review.optimized.summary,
        experiences: review.optimized.experiences,
        skillsOrder: review.optimized.skillsOrder,
      });
      if (result.ok) setApplied(true);
      else setApplyError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      <ScoreHeader score={review.score} potential={review.potentialScore} />

      <Dimensions dimensions={review.dimensions} />

      <div className="grid gap-6 sm:grid-cols-2">
        <Block title="Pontos fortes">
          <Bullets items={review.strengths} />
        </Block>
        <Block title="Pontos fracos">
          <Bullets items={review.weaknesses} />
        </Block>
      </div>

      {review.opportunities.length > 0 && (
        <Block title="Oportunidades de melhoria">
          <Bullets items={review.opportunities} />
        </Block>
      )}

      <Block title="Problemas encontrados">
        <IssueList issues={review.issues} />
      </Block>

      {review.recommendations.length > 0 && (
        <Block title="Recomendações, na ordem em que devem ser feitas">
          <ol className="space-y-2 text-sm leading-relaxed text-ink-soft">
            {review.recommendations.map((item, index) => (
              <li key={`${item}-${index}`} className="flex gap-2.5">
                <span className="shrink-0 font-semibold tabular-nums text-brand-600">{index + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </Block>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <Block title="Palavras-chave presentes">
          <ChipList items={review.keywords.present} tone="brand" />
        </Block>
        <Block title="Palavras-chave ausentes">
          <ChipList items={review.keywords.missing} tone="danger" />
        </Block>
      </div>

      <div className="border-t border-line pt-6">
        <h2 className="text-lg font-bold text-ink">Seu currículo otimizado está pronto.</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Confira abaixo antes de aplicar. Nada foi alterado no seu currículo até você clicar.
        </p>
      </div>

      {applied && (
        <Alert tone="success" title="Aplicado no seu currículo">
          As alterações foram salvas. Você ainda pode editar tudo manualmente.
        </Alert>
      )}
      {applyError && <Alert tone="danger">{applyError}</Alert>}

      <Block title="Resumo profissional reescrito">
        <p className="whitespace-pre-wrap rounded-lg border border-line bg-canvas p-4 text-sm leading-relaxed text-ink">
          {review.optimized.summary || 'Sem alteração no resumo.'}
        </p>
      </Block>

      {review.optimized.notes.length > 0 && (
        <Alert tone="info" title="Observações">
          <Bullets items={review.optimized.notes} />
        </Alert>
      )}

      {/*
        OS DOIS DOCUMENTOS, LADO A LADO E COM A DIFERENÇA ESCRITA.

        Eles saem da mesma tela, no mesmo minuto, e vão para a mesma pasta de
        downloads. Sem dizer aqui, em texto, qual é qual, alguém vai anexar o
        marcado numa candidatura — e entregar ao recrutador um documento cheio
        de marcas vermelhas apontando os defeitos do próprio currículo.

        O marcado usa `base` (o currículo COMO ESTÁ) e o limpo usa `preview` (o
        currículo com a proposta aplicada). Trocar os dois entregaria a versão
        melhorada cheia de marcas e a versão com defeito como se fosse a boa.
      */}
      <Block title="Leve o diagnóstico com você">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-sm font-semibold text-ink">Currículo marcado</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              O seu currículo de hoje, com cada problema desenhado em cima do trecho onde ele está,
              numerado e explicado no fim. É material de trabalho —{' '}
              <strong className="font-semibold text-ink">não envie para vagas</strong>.
            </p>
            <div className="mt-3">
              <DownloadDiagnosticButton
                resume={base}
                issues={review.issues}
                score={review.score}
                potentialScore={review.potentialScore}
              />
            </div>
          </div>

          <div className="rounded-card border border-brand-200 bg-brand-50/40 p-4">
            <p className="text-sm font-semibold text-ink">Currículo melhorado</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              A versão reescrita, limpa e pronta para enviar. O texto é o seu, melhor escrito — nenhum
              resultado, número ou experiência foi acrescentado.
            </p>
            <div className="mt-3">
              <DownloadPdfButton resume={preview} label="Baixar currículo melhorado" />
            </div>
          </div>
        </div>
      </Block>

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={apply} loading={applying} loadingLabel="Aplicando...">
          Aplicar no meu currículo
        </Button>
        <Button type="button" variant="ghost" onClick={onReanalyze}>
          Analisar de novo
        </Button>
      </div>

      <Block title="Como ficaria">
        <div className="rounded-card bg-canvas p-3 sm:p-5">
          <ResumeSheet resume={preview} />
        </div>
      </Block>
    </div>
  );
}
