'use client';

import { useCallback, useEffect, useState } from 'react';
import { interviewQuestionsAction } from '@/server/actions/ai';
import { useAiAction } from '@/hooks/useAiAction';
import { useJobDescription } from '@/hooks/useJobDescription';
import { track } from '@/lib/analytics/track';
import { cx } from '@/lib/utils';
import type { InterviewQuestion, InterviewQuestionKind } from '@/types/ai';
import type { ResumeContent } from '@/types/resume';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge } from '@/components/ui/Feedback';
import { AiResultPanel } from '@/components/ai/AiResultPanel';
import { IntegrityNote } from '@/components/ai/AiNotices';
import { JobDescriptionInput } from './ToolPieces';

/**
 * Preparação para entrevista.
 *
 * As perguntas ficam em acordeão: dez respostas abertas de uma vez viram uma
 * parede de texto que ninguém lê. Fechadas, a pessoa consegue ler a pergunta,
 * pensar na própria resposta e só então abrir a orientação — que é como a
 * preparação funciona de verdade.
 */

const KIND_LABEL: Record<InterviewQuestionKind, { label: string; tone: 'neutral' | 'info' | 'warning' | 'success' }> = {
  comportamental: { label: 'Comportamental', tone: 'info' },
  tecnica: { label: 'Técnica', tone: 'warning' },
  experiencia: { label: 'Experiência', tone: 'neutral' },
  'pontos-fortes': { label: 'Pontos fortes', tone: 'success' },
  desenvolvimento: { label: 'Desenvolvimento', tone: 'neutral' },
};

export function InterviewTool({ resume }: { resume: ResumeContent }) {
  const { jobDescription, setJobDescription } = useJobDescription();
  const prep = useAiAction(interviewQuestionsAction);
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const run = useCallback(() => {
    setOpenIndex(0);
    prep.run(resume, jobDescription);
  }, [prep, resume, jobDescription]);

  useEffect(() => {
    if (prep.data) {
      track('interview_prep', { modo: prep.data.mode, perguntas: prep.data.data.questions.length });
    }
  }, [prep.data]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Preparar para entrevista"
          description="Perguntas prováveis com base no seu histórico e na vaga, com orientação de como responder cada uma."
        />
        <CardBody className="space-y-4">
          <JobDescriptionInput
            value={jobDescription}
            onChange={setJobDescription}
            rows={6}
            hint="Opcional. Com a vaga colada, as perguntas técnicas ficam bem mais precisas."
          />

          <Button
            type="button"
            onClick={run}
            loading={prep.pending}
            loadingLabel="Preparando perguntas..."
            className="uppercase tracking-wide"
          >
            Preparar para minha entrevista
          </Button>

          <Alert tone="neutral">
            Nenhuma orientação aqui sugere mentir, inflar experiência ou esconder o que você não
            sabe. Entrevistador experiente descobre — e aí você perde a vaga e a credibilidade.
          </Alert>

          <IntegrityNote />
        </CardBody>
      </Card>

      {(prep.pending || prep.error || prep.data) && (
        <Card>
          <CardHeader title="Suas perguntas" />
          <CardBody>
            <AiResultPanel
              pending={prep.pending}
              error={prep.error}
              mode={prep.data?.mode}
              notice={prep.data?.notice}
              hasResult={Boolean(prep.data)}
              onRetry={run}
              pendingMessage="Montando as perguntas com base no seu currículo..."
              emptyMessage="Clique em preparar para gerar as perguntas."
            >
              {prep.data && (
                <ul className="space-y-2">
                  {prep.data.data.questions.map((question, index) => (
                    <QuestionItem
                      key={`${question.question}-${index}`}
                      question={question}
                      index={index}
                      open={openIndex === index}
                      onToggle={() => setOpenIndex(openIndex === index ? null : index)}
                    />
                  ))}
                </ul>
              )}
            </AiResultPanel>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function QuestionItem({
  question,
  index,
  open,
  onToggle,
}: {
  question: InterviewQuestion;
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const kind = KIND_LABEL[question.kind] ?? KIND_LABEL.comportamental;
  const panelId = `pergunta-${index}`;

  return (
    <li className="overflow-hidden rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-canvas"
      >
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-canvas text-xs font-bold text-ink-soft">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{question.question}</span>
          <span className="mt-1.5 inline-block">
            <Badge tone={kind.tone}>{kind.label}</Badge>
          </span>
        </span>
        <svg
          viewBox="0 0 24 24"
          className={cx('mt-1 h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div id={panelId} className="border-t border-line bg-canvas px-4 py-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Como responder</h4>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{question.howToAnswer}</p>

          {question.structure.length > 0 && (
            <>
              <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
                Estrutura da resposta
              </h4>
              <ol className="mt-1.5 space-y-1.5">
                {question.structure.map((step, stepIndex) => (
                  <li key={`${step}-${stepIndex}`} className="flex gap-2.5 text-sm text-ink-soft">
                    <span className="font-semibold text-brand-600">{stepIndex + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </li>
  );
}
