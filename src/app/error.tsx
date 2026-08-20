'use client';

import { useEffect } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Logo } from '@/components/layout/Logo';

/** Fronteira de erro das páginas públicas. */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[site]', error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-8 text-2xl font-bold text-ink">Algo deu errado</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        Tente recarregar a página. Se o problema continuar, volte em alguns minutos.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={reset}>
          Tentar de novo
        </Button>
        <ButtonLink href="/" variant="secondary">
          Ir para o início
        </ButtonLink>
      </div>
    </div>
  );
}
