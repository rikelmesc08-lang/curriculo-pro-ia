'use client';

import { useActionState } from 'react';
import { deleteApplicationAction, updateApplicationStatusAction } from '@/server/actions/applications';
import { idleFormState } from '@/lib/forms/state';
import { APPLICATION_STATUSES, type Application } from '@/types/application';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';

/**
 * Uma candidatura na lista.
 *
 * O status é um `<select>` dentro de um formulário que envia no `change`: é o
 * campo que mais muda, e obrigar a pessoa a escolher e depois clicar em salvar
 * dobraria o número de toques da ação mais frequente da tela.
 *
 * O layout troca de forma no celular: tabela vira card empilhado, porque seis
 * colunas em 360px não cabem sem rolagem horizontal.
 */
export function ApplicationRow({ application }: { application: Application }) {
  const [, updateAction] = useActionState(updateApplicationStatusAction, idleFormState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteApplicationAction, idleFormState);

  const statusInfo = APPLICATION_STATUSES.find((item) => item.id === application.status);

  return (
    <li className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{application.role}</p>
          <p className="text-sm text-muted">{application.company}</p>
          {application.appliedAt && (
            <p className="mt-1 text-xs text-muted">Candidatura em {formatDate(application.appliedAt)}</p>
          )}
        </div>

        <Badge tone={statusInfo?.tone ?? 'neutral'}>{statusInfo?.label ?? application.status}</Badge>
      </div>

      {application.notes && (
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-canvas p-3 text-sm leading-relaxed text-ink-soft">
          {application.notes}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <form action={updateAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={application.id} />
          <label htmlFor={`status-${application.id}`} className="text-xs font-medium text-muted">
            Status
          </label>
          <select
            id={`status-${application.id}`}
            name="status"
            defaultValue={application.status}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
            className="rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink"
          >
            {APPLICATION_STATUSES.map((status) => (
              <option key={status.id} value={status.id}>
                {status.label}
              </option>
            ))}
          </select>
          {/* Alternativa para quem está sem JavaScript: o `change` não dispara
              o envio, então o botão precisa existir. */}
          <noscript>
            <button type="submit" className="rounded-md border border-line-strong px-2 py-1 text-xs">
              Salvar
            </button>
          </noscript>
        </form>

        {application.link && (
          <a
            href={application.link}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline"
          >
            <Icon name="olho" className="h-3.5 w-3.5" />
            Ver vaga
          </a>
        )}

        <form action={deleteAction} className="ml-auto">
          <input type="hidden" name="id" value={application.id} />
          <button
            type="submit"
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-60"
          >
            <Icon name="lixeira" className="h-3.5 w-3.5" />
            {deleting ? 'Removendo...' : 'Remover'}
          </button>
        </form>
      </div>

      {deleteState.status === 'error' && deleteState.message && (
        <p className="mt-2 text-xs text-danger">{deleteState.message}</p>
      )}
    </li>
  );
}
