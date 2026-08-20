'use client';

import { useCallback, useState } from 'react';
import { recruiterMessageAction } from '@/server/actions/ai';
import { useAiAction } from '@/hooks/useAiAction';
import { cx } from '@/lib/utils';
import {
  RECRUITER_MESSAGE_KINDS,
  type AiEnvelope,
  type RecruiterMessage,
  type RecruiterMessageKind,
} from '@/types/ai';
import type { ResumeContent } from '@/types/resume';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { AiResultPanel } from '@/components/ai/AiResultPanel';
import { CopyButton, IntegrityNote } from '@/components/ai/AiNotices';

/**
 * Gerador de mensagens para recrutadores.
 *
 * Seis situações, seis tons diferentes. A escolha da situação é a primeira
 * coisa da tela porque é ela que muda tudo: um follow-up e um agradecimento
 * pós-entrevista não se parecem em nada, e usar o texto errado queima a
 * conversa.
 */
export function RecruiterMessageTool({ resume }: { resume: ResumeContent }) {
  const [kind, setKind] = useState<RecruiterMessageKind>('primeiro-contato');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState(resume.goal.targetRole);
  const [context, setContext] = useState('');
  const [draft, setDraft] = useState('');

  // O resultado vira texto editável assim que chega — sem efeito observando
  // `data`, que rodaria uma renderização depois e poderia atropelar a edição
  // que a pessoa já tivesse começado.
  const receive = useCallback((result: AiEnvelope<RecruiterMessage>) => {
    const { subject, body } = result.data;
    setDraft(subject ? `Assunto: ${subject}\n\n${body}` : body);
  }, []);

  const message = useAiAction(recruiterMessageAction, receive);

  const run = useCallback(() => {
    message.run(resume, kind, company, role, context);
  }, [message, resume, kind, company, role, context]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Mensagem para recrutador"
          description="Escolha a situação e gere uma mensagem curta e profissional."
        />
        <CardBody className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-soft">Qual é a situação?</legend>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {RECRUITER_MESSAGE_KINDS.map((option) => {
                const selected = kind === option.id;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => setKind(option.id)}
                      aria-pressed={selected}
                      className={cx(
                        'flex h-full w-full flex-col rounded-lg border p-3 text-left transition-colors',
                        selected
                          ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
                          : 'border-line bg-surface hover:border-line-strong'
                      )}
                    >
                      <span className="text-sm font-semibold text-ink">{option.label}</span>
                      <span className="mt-0.5 text-xs text-muted">{option.hint}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Empresa"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              optional
            />
            <TextField
              label="Cargo"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              optional
            />
          </div>

          <TextAreaField
            label="Contexto extra"
            optional
            rows={3}
            value={context}
            onChange={(event) => setContext(event.target.value)}
            hint="Algo que a mensagem precisa mencionar: quando foi a entrevista, quem te indicou, um prazo combinado."
          />

          <Button
            type="button"
            onClick={run}
            loading={message.pending}
            loadingLabel="Escrevendo..."
          >
            Gerar mensagem
          </Button>

          <IntegrityNote />
        </CardBody>
      </Card>

      {(message.pending || message.error || message.data) && (
        <Card>
          <CardHeader
            title="Sua mensagem"
            action={draft ? <CopyButton text={draft} label="Copiar mensagem" /> : undefined}
          />
          <CardBody>
            <AiResultPanel
              pending={message.pending}
              error={message.error}
              mode={message.data?.mode}
              notice={message.data?.notice}
              hasResult={Boolean(message.data)}
              onRetry={run}
              pendingMessage="Escrevendo a mensagem..."
              emptyMessage="Escolha a situação e clique em gerar."
            >
              <div className="space-y-4">
                <TextAreaField
                  label="Texto"
                  rows={10}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <Button type="button" variant="secondary" onClick={run} loading={message.pending}>
                  Regenerar
                </Button>
              </div>
            </AiResultPanel>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
