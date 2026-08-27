'use client';

import { useActionState } from 'react';
import {
  changePasswordAction,
  deleteAccountAction,
  updateProfileAction,
} from '@/lib/auth/actions';
import { idleFormState } from '@/lib/forms/state';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { TextField } from '@/components/ui/Field';

/** Nome exibido no painel e usado como padrão no currículo. */
export function ProfileForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, idleFormState);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.status === 'error' && state.message && <Alert tone="danger">{state.message}</Alert>}
      {state.status === 'success' && state.message && <Alert tone="success">{state.message}</Alert>}

      <TextField label="Nome" name="name" defaultValue={name} required error={state.fieldErrors?.name} />

      <Button type="submit" loading={pending} loadingLabel="Salvando...">
        Salvar nome
      </Button>
    </form>
  );
}

/**
 * Troca de senha.
 *
 * Pede a senha ATUAL, conferida no servidor antes de qualquer troca — ver
 * `changePasswordAction`. Sucesso derruba os outros dispositivos conectados
 * e mantém esta sessão logada; o texto de sucesso avisa disso.
 */
export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, idleFormState);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.status === 'error' && state.message && <Alert tone="danger">{state.message}</Alert>}
      {state.status === 'success' && state.message && <Alert tone="success">{state.message}</Alert>}

      <TextField
        label="Senha atual"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.currentPassword}
      />

      <TextField
        label="Nova senha"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="Pelo menos 8 caracteres."
        error={state.fieldErrors?.password}
      />

      <Button type="submit" variant="secondary" loading={pending} loadingLabel="Trocando...">
        Trocar senha
      </Button>
    </form>
  );
}

/**
 * Exclusão de conta.
 *
 * Pede a palavra EXCLUIR digitada. É atrito de propósito: o botão fica na
 * mesma tela do "salvar nome", e a ação apaga currículo e candidaturas sem
 * volta. Um clique acidental aqui não pode ser suficiente.
 */
export function DeleteAccountForm({ driver }: { driver: 'local' | 'supabase' }) {
  const [state, action, pending] = useActionState(deleteAccountAction, idleFormState);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.status === 'error' && state.message && <Alert tone="danger">{state.message}</Alert>}

      <Alert tone="danger" title="Isto não tem volta">
        <p>
          Serão apagados: seu currículo, todas as candidaturas registradas e seus dados de perfil.
          Baixe o PDF do seu currículo antes, se quiser guardá-lo.
        </p>
        {driver === 'supabase' && (
          <p className="mt-2">
            O registro de login (e-mail e senha) é removido pelo provedor de autenticação e pode
            levar até alguns minutos para sumir por completo. Nenhum conteúdo seu permanece nele.
          </p>
        )}
      </Alert>

      <TextField
        label="Digite EXCLUIR para confirmar"
        name="confirmacao"
        required
        error={state.fieldErrors?.confirmacao}
        placeholder="EXCLUIR"
        autoComplete="off"
      />

      <Button type="submit" variant="danger" loading={pending} loadingLabel="Excluindo...">
        Excluir minha conta e meus dados
      </Button>
    </form>
  );
}
