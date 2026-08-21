'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestPasswordResetAction, resetPasswordAction } from '@/lib/auth/actions';
import { idleFormState } from '@/lib/forms/state';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';

/**
 * As duas telas de recuperação de senha.
 *
 * Como no `AuthForm`, o `<form action={...}>` com `useActionState` funciona
 * antes de o JavaScript carregar: é POST normal, e o estado de erro chega na
 * resposta. Numa tela de recuperação isso importa ainda mais que no login — a
 * pessoa costuma chegar aqui de celular, com pressa e com internet ruim.
 */

export function RequestResetForm({ erro }: { erro?: string }) {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, idleFormState);

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-bold text-ink">Esqueceu sua senha?</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Informe o e-mail da sua conta e enviamos um link para você criar uma senha nova.
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
          <Alert tone="success" className="mt-5" title="Pedido enviado">
            {state.message}
          </Alert>
          {/*
            O aviso é necessário porque a confirmação acima é a mesma para
            e-mail cadastrado e não cadastrado — não revelamos quem tem conta
            aqui. Sem esta linha, quem digitou errado ficaria esperando para
            sempre um e-mail que nunca sai.
          */}
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Não recebeu em alguns minutos? O endereço pode estar diferente do que você cadastrou.
            Confira e{' '}
            <Link href="/esqueci-senha" className="underline hover:text-brand-700">
              tente de novo
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
            Enviar link de recuperação
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted">
        Lembrou a senha?{' '}
        <Link href="/login" className="font-semibold text-brand-700 hover:underline">
          Entrar
        </Link>
      </p>
    </Card>
  );
}

/**
 * Definição da senha nova.
 *
 * O `token` só existe no driver local — no Supabase a prova de identidade é a
 * sessão de recuperação que o link do e-mail deixou no cookie. O campo oculto
 * simplesmente não é renderizado quando não há token, e a ação de servidor sabe
 * qual dos dois caminhos seguir.
 */
export function NewPasswordForm({ token }: { token?: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, idleFormState);

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-bold text-ink">Criar nova senha</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Escolha uma senha nova para sua conta. Depois de salvar, você entra com ela.
      </p>

      {state.status === 'error' && state.message && (
        <Alert tone="danger" className="mt-5">
          {state.message}
          {/*
            "Peça um novo link" sem um link para pedir é um beco: esta tela só
            é alcançada pelo e-mail, e quem chega com o link vencido não tem
            para onde ir a não ser adivinhar o endereço da tela anterior. O
            formulário abaixo continua visível, mas ele não resolve nada neste
            estado — a prova de identidade é que expirou, não a senha.
          */}
          {state.code === 'link-de-recuperacao-invalido' && (
            <p className="mt-2">
              <Link href="/esqueci-senha" className="font-semibold underline">
                Pedir um novo link de recuperação
              </Link>
            </p>
          )}
        </Alert>
      )}

      <form action={formAction} className="mt-6 space-y-4" noValidate>
        {token && <input type="hidden" name="token" value={token} />}

        <TextField
          label="Nova senha"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          error={state.fieldErrors?.password}
          hint="Pelo menos 8 caracteres."
        />

        <TextField
          label="Repita a nova senha"
          name="confirmacao"
          type="password"
          autoComplete="new-password"
          required
          error={state.fieldErrors?.confirmacao}
        />

        <Button type="submit" block size="lg" loading={pending} loadingLabel="Salvando...">
          Salvar nova senha
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        O link não funcionou?{' '}
        <Link href="/esqueci-senha" className="font-semibold text-brand-700 hover:underline">
          Pedir outro
        </Link>
      </p>
    </Card>
  );
}
