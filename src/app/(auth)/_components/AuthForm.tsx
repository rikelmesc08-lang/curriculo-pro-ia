'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signInAction, signUpAction } from '@/lib/auth/actions';
import { idleFormState } from '@/lib/forms/state';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';

/**
 * Formulário de entrada e de cadastro.
 *
 * Um componente para os dois porque a diferença é um campo e dois rótulos —
 * duplicar traria o risco clássico de corrigir a validação num arquivo e
 * esquecer o outro.
 *
 * `useActionState` mantém o formulário funcionando mesmo antes de o JavaScript
 * carregar: o `<form action={...}>` faz POST normal, e o estado de erro chega
 * na resposta. Numa tela de login, isso é a diferença entre a pessoa entrar ou
 * ficar olhando um botão morto com internet ruim.
 */
export function AuthForm({
  mode,
  next,
  notice,
}: {
  mode: 'entrar' | 'cadastrar';
  next?: string;
  /** Aviso vindo da URL — hoje, a confirmação de senha redefinida. */
  notice?: string;
}) {
  const isSignUp = mode === 'cadastrar';
  const [state, formAction, pending] = useActionState(
    isSignUp ? signUpAction : signInAction,
    idleFormState
  );

  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-bold text-ink">
        {isSignUp ? 'Criar sua conta' : 'Entrar na sua conta'}
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        {isSignUp
          ? 'Leva menos de um minuto. Nenhum cartão é pedido.'
          : 'Continue de onde você parou.'}
      </p>

      {notice && state.status === 'idle' && (
        <Alert tone="success" className="mt-5">
          {notice}
        </Alert>
      )}

      {state.status === 'error' && state.message && (
        <Alert tone="danger" className="mt-5">
          {state.message}
          {/*
            A SAÍDA PRECISA VIR JUNTO DO ERRO. "Sua conta ainda não foi
            confirmada" sem um caminho ao lado é a mesma armadilha de antes,
            só que com o texto certo: a pessoa tem a senha correta, não
            consegue entrar, e o único botão à vista continua sendo "Entrar".
            Quem perdeu o e-mail não tem como adivinhar que existe reenvio.
          */}
          {state.code === 'email-nao-confirmado' && (
            <p className="mt-2">
              <Link href="/confirmar-email" className="font-semibold underline">
                Reenviar o e-mail de confirmação
              </Link>
            </p>
          )}
        </Alert>
      )}
      {state.status === 'success' && state.message && (
        <Alert tone="success" className="mt-5">
          {state.message}
          {/*
            Cadastro que precisa de confirmação também termina aqui, e a pessoa
            fecha a aba achando que acabou. Se o e-mail não chegar, ela volta
            sem lembrar que existe esta saída.
          */}
          {state.code === 'confirmacao-pendente' && (
            <p className="mt-2">
              <Link href="/confirmar-email" className="font-semibold underline">
                Não recebeu? Reenviar o e-mail
              </Link>
            </p>
          )}
        </Alert>
      )}

      <form action={formAction} className="mt-6 space-y-4" noValidate>
        {next && <input type="hidden" name="proximo" value={next} />}

        {isSignUp && (
          <TextField
            label="Nome completo"
            name="name"
            type="text"
            autoComplete="name"
            required
            error={state.fieldErrors?.name}
            placeholder="Como você assina profissionalmente"
          />
        )}

        <TextField
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          error={state.fieldErrors?.email}
          placeholder="voce@email.com"
        />

        <div>
          <TextField
            label="Senha"
            name="password"
            type="password"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            required
            error={state.fieldErrors?.password}
            hint={isSignUp ? 'Pelo menos 8 caracteres.' : undefined}
          />
          {/*
            Colado ao campo de senha, e não escondido no rodapé: quem procura
            este link já está frustrado, e é o momento em que a pessoa
            abandona o produto se não achar.
          */}
          {!isSignUp && (
            <p className="mt-2 text-right">
              <Link href="/esqueci-senha" className="text-sm text-brand-700 hover:underline">
                Esqueci minha senha
              </Link>
            </p>
          )}
        </div>

        <Button type="submit" block size="lg" loading={pending} loadingLabel={isSignUp ? 'Criando conta...' : 'Entrando...'}>
          {isSignUp ? 'Criar conta' : 'Entrar'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {isSignUp ? (
          <>
            Já tem conta?{' '}
            <Link href="/login" className="font-semibold text-brand-700 hover:underline">
              Entrar
            </Link>
          </>
        ) : (
          <>
            Ainda não tem conta?{' '}
            <Link href="/cadastro" className="font-semibold text-brand-700 hover:underline">
              Criar conta
            </Link>
          </>
        )}
      </p>

      {isSignUp && (
        <p className="mt-4 text-center text-xs leading-relaxed text-muted">
          Ao criar a conta você concorda com os{' '}
          <Link href="/termos" className="underline hover:text-brand-700">termos de uso</Link> e com a{' '}
          <Link href="/privacidade" className="underline hover:text-brand-700">política de privacidade</Link>.
        </p>
      )}
    </Card>
  );
}
