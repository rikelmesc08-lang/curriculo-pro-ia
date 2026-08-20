'use client';

import { useMemo, useState } from 'react';
import { useResumeDraft, type SaveStatus } from '@/hooks/useResumeDraft';
import { stepsFor, type StepId } from '@/lib/resume/draft';
import { cx } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Stepper } from '@/components/ui/Stepper';
import { TextAreaField } from '@/components/ui/Field';
import { IntegrityNote } from '@/components/ai/AiNotices';
import { AnalyticsEvent } from '@/components/analytics/AnalyticsEvent';
import { GoalStep, PersonalStep } from './steps/IdentitySteps';
import {
  ActivitiesStep,
  CertificationStep,
  EducationStep,
  ExperienceStep,
  ProjectsStep,
} from './steps/HistorySteps';
import { LanguagesStep, SkillsStep } from './steps/AbilitySteps';
import { ReviewStep } from './steps/ReviewStep';
import { ResumeSheet } from './ResumeSheet';
import type { StepProps } from './types';
import type { ResumeContent } from '@/types/resume';

/**
 * Construtor do currículo.
 *
 * Orquestra três coisas: a etapa atual, o rascunho com salvamento automático e
 * a pré-visualização ao vivo. Cada etapa é um componente independente que
 * recebe `content` e `update` — nenhuma delas conhece navegação, gravação nem
 * o resto do formulário.
 *
 * LAYOUT: no desktop, editor à esquerda e prévia grudada à direita, porque ver
 * o efeito da edição é o que dá confiança para continuar preenchendo. No
 * celular a prévia sai do caminho e vira um botão — dividir 360px em duas
 * colunas não ajudaria ninguém.
 */

const STEP_COMPONENTS: Record<Exclude<StepId, 'revisao'>, (props: StepProps) => React.ReactNode> = {
  dados: PersonalStep,
  objetivo: GoalStep,
  experiencia: ExperienceStep,
  formacao: EducationStep,
  cursos: CertificationStep,
  competencias: SkillsStep,
  idiomas: LanguagesStep,
  projetos: ProjectsStep,
  atividades: ActivitiesStep,
};

const STEP_HINTS: Record<StepId, string> = {
  dados: 'Como o recrutador vai te encontrar.',
  objetivo: 'Para qual posição o seu histórico deve ser lido.',
  experiencia: 'Comece pela mais recente.',
  formacao: 'Inclua também o que está em andamento.',
  cursos: 'Cursos livres e certificações contam.',
  competencias: 'O que você usaria numa conversa técnica sem hesitar.',
  idiomas: 'Seja honesto no nível — costuma ser testado.',
  projetos: 'Trabalhos acadêmicos, freelas e projetos pessoais.',
  atividades: 'Voluntariado e atividades extracurriculares.',
  revisao: 'Escolha o modelo, confira e baixe.',
};

export function ResumeBuilder({
  initialId,
  initialContent,
}: {
  initialId: string | null;
  initialContent: ResumeContent;
}) {
  const draft = useResumeDraft({ id: initialId, content: initialContent });
  const steps = useMemo(() => stepsFor(draft.content.variant), [draft.content.variant]);
  const [rawStepIndex, setStepIndex] = useState(0);
  const [jobDescription, setJobDescription] = useState('');
  const [showPreviewOnMobile, setShowPreviewOnMobile] = useState(false);

  // Trocar o tipo de currículo muda a lista de etapas. O índice é AJUSTADO NO
  // RENDER, não num efeito: quem estava na etapa 8 de uma lista de 10 cairia
  // fora do intervalo numa lista de 9 e veria uma tela em branco por um quadro
  // antes de o efeito corrigir.
  const stepIndex = Math.min(rawStepIndex, steps.length - 1);

  const step = steps[stepIndex];
  const isReview = step.id === 'revisao';
  const isLast = stepIndex === steps.length - 1;

  const stepProps: StepProps = {
    content: draft.content,
    update: draft.update,
    jobDescription,
  };

  async function goTo(index: number) {
    // Grava antes de trocar de etapa: se a aba cair no meio da navegação, o
    // que foi digitado na etapa anterior já está salvo.
    await draft.saveNow();
    setStepIndex(index);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const StepComponent = isReview ? null : STEP_COMPONENTS[step.id as Exclude<StepId, 'revisao'>];

  return (
    <div className="space-y-5">
      <AnalyticsEvent event="start_resume" properties={{ variante: initialContent.variant }} />

      <Card>
        <div className="p-5">
          <Stepper steps={steps} currentIndex={stepIndex} onSelect={(index) => void goTo(index)} />
        </div>
      </Card>

      {draft.status === 'erro' && draft.error && (
        <Alert tone="danger" title="Não conseguimos salvar">
          {draft.error} Seu texto continua na tela — não recarregue a página até salvar.
        </Alert>
      )}

      <div className={cx('gap-5', isReview ? 'block' : 'lg:grid lg:grid-cols-[minmax(0,1fr)_380px]')}>
        <div className="min-w-0">
          <Card>
            <CardHeader
              title={step.label}
              description={STEP_HINTS[step.id]}
              action={<SaveIndicator status={draft.status} savedAt={draft.savedAt} />}
            />
            <CardBody>
              {isReview ? <ReviewStep {...stepProps} /> : StepComponent && <StepComponent {...stepProps} />}
            </CardBody>
          </Card>

          {!isReview && (
            <Card className="mt-5">
              <CardHeader
                title="Vaga de referência"
                description="Opcional. Se você colar uma vaga aqui, a IA usa o vocabulário dela ao melhorar seus textos — sem nunca copiar requisitos para dentro do seu currículo."
              />
              <CardBody>
                <TextAreaField
                  label="Descrição da vaga"
                  optional
                  rows={4}
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  placeholder="Cole aqui a descrição da vaga que você está mirando."
                />
                <IntegrityNote className="mt-3 text-xs leading-relaxed text-muted" />
              </CardBody>
            </Card>
          )}

          <nav className="mt-5 flex items-center justify-between gap-3" aria-label="Navegação entre etapas">
            <Button
              type="button"
              variant="secondary"
              disabled={stepIndex === 0}
              onClick={() => void goTo(stepIndex - 1)}
            >
              Voltar
            </Button>

            <span className="text-xs text-muted">
              Etapa {stepIndex + 1} de {steps.length}
            </span>

            <Button type="button" disabled={isLast} onClick={() => void goTo(stepIndex + 1)}>
              Continuar
            </Button>
          </nav>
        </div>

        {!isReview && (
          <aside className="mt-5 lg:mt-0">
            <div className="lg:sticky lg:top-6">
              <button
                type="button"
                onClick={() => setShowPreviewOnMobile((value) => !value)}
                className="mb-3 w-full rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm font-semibold text-ink-soft lg:hidden"
                aria-expanded={showPreviewOnMobile}
              >
                {showPreviewOnMobile ? 'Ocultar pré-visualização' : 'Ver pré-visualização'}
              </button>

              <div className={cx(showPreviewOnMobile ? 'block' : 'hidden', 'lg:block')}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Pré-visualização
                </p>
                <div className="overflow-hidden rounded-card">
                  <ResumeSheet resume={draft.content} scale={0.82} />
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function SaveIndicator({ status, savedAt }: { status: SaveStatus; savedAt: string | null }) {
  const label: Record<SaveStatus, string> = {
    ocioso: savedAt ? 'Salvo' : 'Salva automaticamente',
    salvando: 'Salvando...',
    salvo: 'Salvo',
    erro: 'Falha ao salvar',
  };

  return (
    <span
      // `aria-live` para quem usa leitor de tela saber que gravou, sem precisar
      // procurar o indicador visual.
      aria-live="polite"
      className={cx(
        'text-xs font-medium',
        status === 'erro' ? 'text-danger' : status === 'salvando' ? 'text-muted' : 'text-success'
      )}
    >
      {label[status]}
    </span>
  );
}
