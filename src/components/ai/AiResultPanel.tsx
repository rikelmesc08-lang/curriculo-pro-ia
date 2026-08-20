'use client';

import type { ReactNode } from 'react';
import type { AiMode } from '@/types/ai';
import { Alert } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Spinner';
import { AiModeBadge } from './AiNotices';

/**
 * Casca de todo resultado de IA: carregando, erro, vazio e conteúdo.
 *
 * Existe para que os quatro estados sejam tratados SEMPRE — o estado que
 * costuma faltar numa tela feita às pressas é o de erro, e aqui ele é
 * obrigatório por construção.
 */
export function AiResultPanel({
  pending,
  error,
  mode,
  notice,
  hasResult,
  onRetry,
  pendingMessage,
  emptyMessage,
  children,
}: {
  pending: boolean;
  error: string | null;
  mode?: AiMode;
  notice?: string;
  hasResult: boolean;
  onRetry?: () => void;
  pendingMessage: string;
  emptyMessage: string;
  children: ReactNode;
}) {
  if (pending) {
    return (
      <div
        className="rounded-card border border-line bg-surface p-5"
        aria-live="polite"
        aria-busy="true"
      >
        <p className="text-sm font-medium text-ink-soft">{pendingMessage}</p>
        <div className="mt-4 space-y-2.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-9/12" />
          <Skeleton className="h-3 w-10/12" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert tone="danger" title="Não deu para gerar agora">
        <p>{error}</p>
        {onRetry && (
          <div className="mt-3">
            <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
              Tentar de novo
            </Button>
          </div>
        )}
      </Alert>
    );
  }

  if (!hasResult) {
    return (
      <div className="rounded-card border border-dashed border-line-strong bg-surface px-5 py-10 text-center">
        <p className="text-sm text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {mode && <AiModeBadge mode={mode} />}
      </div>
      {notice && <Alert tone="warning">{notice}</Alert>}
      {children}
    </div>
  );
}
