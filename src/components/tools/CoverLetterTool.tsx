'use client';

import { useCallback, useState } from 'react';
import { coverLetterAction } from '@/server/actions/ai';
import { useAiAction } from '@/hooks/useAiAction';
import { useJobDescription } from '@/hooks/useJobDescription';
import { track } from '@/lib/analytics/track';
import type { AiEnvelope, CoverLetter } from '@/types/ai';
import type { ResumeContent } from '@/types/resume';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { AiResultPanel } from '@/components/ai/AiResultPanel';
import { CopyButton, IntegrityNote } from '@/components/ai/AiNotices';
import { JobDescriptionInput } from './ToolPieces';

/**
 * Gerador de carta de apresentação.
 *
 * Depois de gerada, a carta vira texto editável. É deliberado: carta é o
 * documento mais pessoal da candidatura, e ninguém deveria enviar um parágrafo
 * que não passou pela própria mão. O botão "Copiar" copia o que está no editor,
 * não o texto original da IA — o que a pessoa vê é o que ela leva.
 */
export function CoverLetterTool({ resume }: { resume: ResumeContent }) {
  const { jobDescription, setJobDescription } = useJobDescription();
  const [company, setCompany] = useState('');
  const [role, setRole] = useState(resume.goal.targetRole);
  const [draft, setDraft] = useState('');

  // O texto gerado entra no editor no mesmo passo em que chega, e não num
  // efeito que observa `data`: assim ele nunca sobrescreve o que a pessoa
  // estiver digitando por causa de uma renderização extra.
  const receive = useCallback((result: AiEnvelope<CoverLetter>) => {
    setDraft(letterToText(result.data));
    track('cover_letter_generated', { modo: result.mode });
  }, []);

  const letter = useAiAction(coverLetterAction, receive);

  const run = useCallback(() => {
    letter.run(resume, jobDescription, company, role);
  }, [letter, resume, jobDescription, company, role]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Gerar carta de apresentação"
          description="A carta usa o seu currículo e a vaga. Ela não afirma nada que o seu histórico não mostre."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Empresa"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              placeholder="Nome da empresa"
              optional
            />
            <TextField
              label="Cargo"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              placeholder="Cargo da vaga"
              optional
            />
          </div>

          <JobDescriptionInput
            value={jobDescription}
            onChange={setJobDescription}
            rows={6}
            hint="Opcional, mas a carta fica bem mais específica com a vaga colada."
          />

          <Button
            type="button"
            onClick={run}
            loading={letter.pending}
            loadingLabel="Escrevendo..."
            className="uppercase tracking-wide"
          >
            Gerar carta de apresentação
          </Button>

          <IntegrityNote />
        </CardBody>
      </Card>

      {(letter.pending || letter.error || letter.data) && (
        <Card>
          <CardHeader
            title="Sua carta"
            description="Edite à vontade antes de enviar."
            action={draft ? <CopyButton text={draft} label="Copiar carta" /> : undefined}
          />
          <CardBody>
            <AiResultPanel
              pending={letter.pending}
              error={letter.error}
              mode={letter.data?.mode}
              notice={letter.data?.notice}
              hasResult={Boolean(letter.data)}
              onRetry={run}
              pendingMessage="Escrevendo a carta com base no seu currículo..."
              emptyMessage="Preencha os campos e clique em gerar."
            >
              <div className="space-y-4">
                <TextAreaField
                  label="Texto da carta"
                  rows={16}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />

                <div className="flex flex-wrap gap-3">
                  <Button type="button" variant="secondary" onClick={run} loading={letter.pending}>
                    Regenerar
                  </Button>
                  {letter.data && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setDraft(letterToText(letter.data!.data))}
                    >
                      Restaurar versão gerada
                    </Button>
                  )}
                </div>
              </div>
            </AiResultPanel>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/** Junta saudação, corpo e despedida num texto único, pronto para colar. */
function letterToText(letter: CoverLetter): string {
  return [letter.greeting, '', letter.body.join('\n\n'), '', letter.closing]
    .filter((part) => part !== undefined)
    .join('\n')
    .trim();
}
