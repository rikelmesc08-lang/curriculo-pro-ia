'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { resendConfirmationAction } from '@/lib/auth/actions';
import { idleFormState } from '@/lib/forms/state';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';

/**
 * Pedido de um novo e-mail de confirmação.
 *
 * Mesma construção do formulário de recuperação: `<form action={...}>` com
 * `useActionState` funciona antes de o JavaScript carregar, porque é POST
 * normal. Quem chega aqui já está com um problema nas mãos e costuma estar no
 * celular — não é hora de depender de bundle.
 */
export function ResendConfirmationForm({ erro }: { erro?: string }) {
  const [state, formAction, pending] = useActionState(resendConfirmationAction, idleFormState);

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-bold text-ink">Confirmar seu e-mail</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        O link de confirmação vale uma vez só e expira. Informe o e-mail da sua conta e enviamos
        um link novo.
      </p>

      {erro && state.status === 'idle' && (
        <Alert tone="warning" className="mt-5">
          {erro}
        </Alert>
      )}

      {state.status === 'error' && state.message && (
        <Alert tone="danger" className="mt-5">
          {state.message}
        </Alert>
      )}

      {state.status === 'success' ? (
        <>
          <Alert tone="success" className="mt-5" title="Link enviado">
            {state.message}
          </Alert>
          {/*
            A confirmação acima é idêntica para conta existente, inexistente e
            já confirmada — a tela não conta o estado da conta de ninguém. O
            preço é que quem digitou o endereço errado ficaria esperando sem
            entender; por isso o aviso abaixo diz onde procurar o problema.
          */}
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Não recebeu em alguns minutos? O endereço pode estar diferente do que você cadastrou,
            ou sua conta já pode estar confirmada — nesse caso é só{' '}
            <Link href="/login" className="underline hover:text-brand-700">
              entrar normalmente
            </Link>
            .
          </p>
        </>
      ) : (
        <form action={formAction} className="mt-6 space-y-4" noValidate>
          <TextField
            label="E-mail da conta"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            error={state.fieldErrors?.email}
            placeholder="voce@email.com"
          />

          <Button type="submit" block size="lg" loading={pending} loadingLabel="Enviando...">
            Reenviar confirmação
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted">
        Já confirmou?{' '}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Entrar
        </Link>
      </p>
    </Card>
  );
}
