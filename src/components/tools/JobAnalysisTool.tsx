'use client';

import { useCallback, useEffect } from 'react';
import { analyzeJobAction, atsAnalysisAction, matchResumeAction } from '@/server/actions/ai';
import { useAiAction } from '@/hooks/useAiAction';
import { useJobDescription } from '@/hooks/useJobDescription';
import { track } from '@/lib/analytics/track';
import { ATS_DISCLAIMER, MATCH_DISCLAIMER } from '@/types/ai';
import type { ResumeContent } from '@/types/resume';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { ScoreBar, ScoreRing } from '@/components/ui/Score';
import { AiResultPanel } from '@/components/ai/AiResultPanel';
import { IntegrityNote } from '@/components/ai/AiNotices';
import { ChipList, JobDescriptionInput } from './ToolPieces';

/**
 * Ferramenta "Adaptar meu currículo para uma vaga".
 *
 * Três análises independentes sobre a mesma vaga — o que a vaga pede, quanto o
 * currículo atende, e o quanto ele está preparado para leitura automática.
 * Cada uma tem o próprio botão e o próprio estado, porque cada uma tem custo
 * de IA e a pessoa pode querer só a primeira.
 *
 * O indicador de compatibilidade nunca aparece sem a ressalva ao lado. Um
 * número solto de "78%" numa tela de emprego é lido como probabilidade de ser
 * contratado, e não é isso que ele mede.
 */
export function JobAnalysisTool({ resume }: { resume: ResumeContent }) {
  const { jobDescription, setJobDescription } = useJobDescription();

  const analysis = useAiAction(analyzeJobAction);
  const match = useAiAction(matchResumeAction);
  const ats = useAiAction(atsAnalysisAction);

  const tooShort = jobDescription.trim().length < 40;

  const runAnalysis = useCallback(() => {
    track('job_analysis_started');
    analysis.run(jobDescription);
  }, [analysis, jobDescription]);

  const runMatch = useCallback(() => {
    match.run(resume, jobDescription);
  }, [match, resume, jobDescription]);

  const runAts = useCallback(() => {
    ats.run(resume, jobDescription);
  }, [ats, resume, jobDescription]);

  // Os eventos de conclusão são disparados quando o resultado chega, e não no
  // clique: só assim eles medem análise concluída, e não intenção de analisar.
  useEffect(() => {
    if (analysis.data) {
      track('job_analysis_completed', {
        modo: analysis.data.mode,
        termos: analysis.data.data.keywords.length,
      });
    }
  }, [analysis.data]);

  useEffect(() => {
    if (ats.data) {
      track('ats_analysis', { modo: ats.data.mode, pontuacao: ats.data.data.score });
    }
  }, [ats.data]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Adaptar meu currículo para uma vaga"
          description="Cole a descrição da vaga uma vez. As três análises abaixo trabalham sobre ela."
        />
        <CardBody className="space-y-4">
          <JobDescriptionInput value={jobDescription} onChange={setJobDescription} />

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={runAnalysis}
              disabled={tooShort}
              loading={analysis.pending}
              loadingLabel="Analisando vaga..."
              className="uppercase tracking-wide"
            >
              Analisar vaga com IA
            </Button>
            <Button type="button" variant="secondary" onClick={runMatch} disabled={tooShort} loading={match.pending}>
              Comparar com meu currículo
            </Button>
          </div>

          {tooShort && jobDescription.length > 0 && (
            <Alert tone="warning">
              Cole a descrição completa da vaga. Com poucas palavras não há o que analisar.
            </Alert>
          )}

          <IntegrityNote />
        </CardBody>
      </Card>

      {(analysis.pending || analysis.error || analysis.data) && (
        <Card>
          <CardHeader title="O que esta vaga pede" />
          <CardBody>
            <AiResultPanel
              pending={analysis.pending}
              error={analysis.error}
              mode={analysis.data?.mode}
              notice={analysis.data?.notice}
              hasResult={Boolean(analysis.data)}
              onRetry={runAnalysis}
              pendingMessage="Lendo a descrição da vaga..."
              emptyMessage="Cole a vaga e clique em analisar."
            >
              {analysis.data && (
                <div className="space-y-5">
                  <dl className="grid gap-3 sm:grid-cols-3">
                    {[
                      { label: 'Cargo', value: analysis.data.data.role },
                      { label: 'Nível', value: analysis.data.data.seniority },
                      { label: 'Empresa', value: analysis.data.data.company },
                    ].map((item) => (
                      <div key={item.label} className="rounded-lg border border-line bg-canvas px-3 py-2.5">
                        <dt className="text-xs font-medium text-muted">{item.label}</dt>
                        <dd className="mt-0.5 text-sm font-semibold text-ink">
                          {item.value || <span className="font-normal text-muted">não identificado</span>}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <ResultBlock title="Competências exigidas">
                    <ChipList items={analysis.data.data.skills} tone="brand" />
                  </ResultBlock>

                  <ResultBlock title="Ferramentas e softwares">
                    <ChipList items={analysis.data.data.tools} />
                  </ResultBlock>

                  <ResultBlock title="Qualificações">
                    <BulletList items={analysis.data.data.qualifications} />
                  </ResultBlock>

                  <ResultBlock title="Responsabilidades">
                    <BulletList items={analysis.data.data.responsibilities} />
                  </ResultBlock>

                  <ResultBlock title="Palavras-chave relevantes">
                    <ChipList items={analysis.data.data.keywords} />
                  </ResultBlock>
                </div>
              )}
            </AiResultPanel>
          </CardBody>
        </Card>
      )}

      {(match.pending || match.error || match.data) && (
        <Card>
          <CardHeader title="Compatibilidade estimada" />
          <CardBody>
            <AiResultPanel
              pending={match.pending}
              error={match.error}
              mode={match.data?.mode}
              notice={match.data?.notice}
              hasResult={Boolean(match.data)}
              onRetry={runMatch}
              pendingMessage="Comparando seu currículo com a vaga..."
              emptyMessage="Clique em comparar para ver sua aderência."
            >
              {match.data && (
                <div className="space-y-5">
                  <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                    <ScoreRing value={match.data.data.score} />
                    <p className="text-xs leading-relaxed text-muted sm:pt-4">{MATCH_DISCLAIMER}</p>
                  </div>

                  <ResultBlock title="Pontos fortes">
                    <BulletList items={match.data.data.strengths} tone="success" />
                  </ResultBlock>

                  <ResultBlock title="Possíveis lacunas">
                    {match.data.data.gaps.length === 0 ? (
                      <p className="text-sm text-muted">Nenhuma lacuna relevante identificada.</p>
                    ) : (
                      <ul className="space-y-3">
                        {match.data.data.gaps.map((gap) => (
                          <li key={gap.item} className="rounded-lg border border-line bg-canvas p-3.5">
                            <p className="text-sm font-semibold text-ink">{gap.item}</p>
                            <p className="mt-1 text-sm text-muted">{gap.reason}</p>
                            <p className="mt-1.5 text-sm text-brand-800">{gap.suggestion}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </ResultBlock>

                  <ResultBlock title="Palavras-chave ausentes no seu currículo">
                    <ChipList items={match.data.data.missingKeywords} tone="danger" />
                    <p className="mt-2 text-xs text-muted">
                      Inclua apenas os termos que correspondem a algo que você realmente fez.
                    </p>
                  </ResultBlock>

                  <ResultBlock title="Recomendações">
                    <BulletList items={match.data.data.recommendations} />
                  </ResultBlock>

                  <div className="flex flex-wrap gap-3 border-t border-line pt-4">
                    <ButtonLink href="/app/otimizar" className="uppercase tracking-wide">
                      Otimizar meu currículo
                    </ButtonLink>
                    <ButtonLink href="/app/carta" variant="secondary">
                      Gerar carta de apresentação
                    </ButtonLink>
                  </div>
                </div>
              )}
            </AiResultPanel>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Análise ATS"
          description="O quanto seu currículo está preparado para leitura automática e para a triagem rápida de um recrutador."
          action={
            <Button type="button" variant="secondary" size="sm" onClick={runAts} loading={ats.pending}>
              Analisar
            </Button>
          }
        />
        <CardBody>
          <AiResultPanel
            pending={ats.pending}
            error={ats.error}
            mode={ats.data?.mode}
            notice={ats.data?.notice}
            hasResult={Boolean(ats.data)}
            onRetry={runAts}
            pendingMessage="Avaliando estrutura, clareza e palavras-chave..."
            emptyMessage="Clique em analisar para ver a pontuação do seu currículo. A vaga colada acima é opcional, mas melhora a análise."
          >
            {ats.data && (
              <AtsResult
                score={ats.data.data.score}
                criteria={ats.data.data.criteria}
                recommendations={ats.data.data.recommendations}
              />
            )}
          </AiResultPanel>
        </CardBody>
      </Card>
    </div>
  );
}

function AtsResult({
  score,
  criteria,
  recommendations,
}: {
  score: number;
  criteria: { id: string; label: string; score: number; comment: string }[];
  recommendations: string[];
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <ScoreRing value={score} suffix="" caption="ATS" />
        <p className="text-xs leading-relaxed text-muted sm:pt-4">{ATS_DISCLAIMER}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {criteria.map((criterion) => (
          <ScoreBar
            key={criterion.id}
            label={criterion.label}
            value={criterion.score}
            comment={criterion.comment}
          />
        ))}
      </div>

      <ResultBlock title="Recomendações">
        <BulletList items={recommendations} />
      </ResultBlock>
    </div>
  );
}

function ResultBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function BulletList({ items, tone }: { items: string[]; tone?: 'success' }) {
  if (items.length === 0) return <p className="text-sm text-muted">Nada a destacar.</p>;

  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2.5 text-sm leading-relaxed text-ink-soft">
          <span className={tone === 'success' ? 'text-success' : 'text-brand-500'} aria-hidden="true">
            •
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
