'use client';

import { useEffect } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';

/**
 * Fronteira de erro do painel.
 *
 * Mostra a mensagem da exceção quando ela é nossa e legível (as do repositório
 * e da camada de IA são escritas para pessoas), e um texto genérico quando não
 * é. Nunca imprime pilha de execução: além de não ajudar o usuário, ela expõe
 * caminhos internos do servidor.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[painel]', error);
  }, [error]);

  return (
    <Card>
      <CardBody className="py-10 text-center">
        <h1 className="text-lg font-bold text-ink">Algo deu errado nesta tela</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
          Seus dados salvos estão a salvo. Tente de novo — se continuar acontecendo, volte ao painel
          e siga por outro caminho.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-muted">
            Código do erro: <code className="font-mono">{error.digest}</code>
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button type="button" onClick={reset}>
            Tentar de novo
          </Button>
          <ButtonLink href="/app" variant="secondary">
            Voltar ao painel
          </ButtonLink>
        </div>
      </CardBody>
    </Card>
  );
}
