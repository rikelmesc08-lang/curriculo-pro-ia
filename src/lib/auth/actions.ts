'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getRepository } from '@/lib/db';
import { createSupabaseServerClient } from '@/lib/db/supabase/client';
import { env } from '@/lib/env';
import { formError, formSuccess, text, type FormState } from '@/lib/forms/state';
import { authenticateLocalUser, changeLocalPassword, createLocalUser } from './local';
import { createLocalSessionValue, getSessionUser, sessionCookie } from './session';
import { fieldErrorsFrom, normalizeEmail, passwordSchema, signInSchema, signUpSchema } from './validation';

/**
 * Ações de autenticação.
 *
 * ESTE ARQUIVO SÓ EXPORTA FUNÇÃO ASYNC. Um `export const` aqui passa por tsc,
 * lint e build sem reclamar, e só estoura no clique real do usuário — a
 * diretiva `"use server"` transforma cada export num endpoint, e endpoint que
 * não é função não existe. Tipos e helpers moram em `@/lib/forms/state`.
 */

/** Destino seguro pós-login: só caminho interno, nunca URL absoluta. */
function safeNext(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/app';
  return value;
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    name: text(formData, 'name'),
    email: text(formData, 'email'),
    password: text(formData, 'password'),
  });

  if (!parsed.success) {
    return formError('Confira os campos destacados.', fieldErrorsFrom(parsed.error));
  }

  const { name, email, password } = parsed.data;
  const next = safeNext(text(formData, 'proximo') || '/app');

  if (env.dbDriver() === 'supabase') {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.auth.signUp({
      email: normalizeEmail(email),
      password,
      options: { data: { name } },
    });

    if (error) {
      return formError(
        error.message.toLowerCase().includes('already')
          ? 'Já existe uma conta com este e-mail. Tente entrar.'
          : 'Não conseguimos criar sua conta agora. Tente de novo em instantes.'
      );
    }

    // Projeto com confirmação de e-mail ligada devolve usuário sem sessão. Dizer
    // "conta criada, agora entre" seria mentira: a pessoa ainda precisa clicar
    // no link do e-mail.
    if (!data.session) {
      return formSuccess('Conta criada. Confirme seu e-mail pelo link que enviamos para entrar.');
    }
  } else {
    const result = await createLocalUser({ name, email, password });
    if (!result.ok) {
      return formError('Já existe uma conta com este e-mail. Tente entrar.', {
        email: 'E-mail já cadastrado.',
      });
    }

    const session = createLocalSessionValue(result.user.id);
    const store = await cookies();
    store.set(sessionCookie.name, session.value, sessionCookie.options(session.expiresAt));
  }

  redirect(next);
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: text(formData, 'email'),
    password: text(formData, 'password'),
  });

  if (!parsed.success) {
    return formError('Confira os campos destacados.', fieldErrorsFrom(parsed.error));
  }

  const { email, password } = parsed.data;
  const next = safeNext(text(formData, 'proximo') || '/app');

  // A mensagem de erro é a mesma para e-mail inexistente e senha errada, nos
  // dois drivers. Diferenciar entregaria de graça a lista de quem tem conta.
  const invalid = 'E-mail ou senha incorretos.';

  if (env.dbDriver() === 'supabase') {
    const client = await createSupabaseServerClient();
    const { error } = await client.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error) return formError(invalid);
  } else {
    const result = await authenticateLocalUser({ email, password });
    if (!result.ok) return formError(invalid);

    const session = createLocalSessionValue(result.user.id);
    const store = await cookies();
    store.set(sessionCookie.name, session.value, sessionCookie.options(session.expiresAt));
  }

  redirect(next);
}

export async function signOutAction(): Promise<void> {
  if (env.dbDriver() === 'supabase') {
    const client = await createSupabaseServerClient();
    await client.auth.signOut();
  }

  const store = await cookies();
  store.delete(sessionCookie.name);
  redirect('/');
}

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return formError('Sua sessão expirou. Entre de novo.');

  const name = text(formData, 'name');
  if (name.length < 2) return formError('Informe seu nome.', { name: 'Informe seu nome.' });

  const repository = await getRepository();
  await repository.updateUser(user.id, { name });
  revalidatePath('/app', 'layout');
  return formSuccess('Nome atualizado.');
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return formError('Sua sessão expirou. Entre de novo.');

  const parsed = passwordSchema.safeParse(text(formData, 'password'));
  if (!parsed.success) {
    return formError('Confira a nova senha.', { password: parsed.error.issues[0].message });
  }

  if (env.dbDriver() === 'supabase') {
    const client = await createSupabaseServerClient();
    const { error } = await client.auth.updateUser({ password: parsed.data });
    if (error) return formError('Não conseguimos trocar a senha agora. Tente de novo.');
  } else {
    const changed = await changeLocalPassword(user.id, parsed.data);
    if (!changed) return formError('Não conseguimos trocar a senha agora. Tente de novo.');
  }

  return formSuccess('Senha atualizada.');
}

/**
 * Exclusão de conta e de todos os dados.
 *
 * Exige que a pessoa digite EXCLUIR: o botão fica ao lado de "salvar nome", e
 * um clique errado aqui apaga currículo e candidaturas sem volta.
 */
export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return formError('Sua sessão expirou. Entre de novo.');

  if (text(formData, 'confirmacao').toUpperCase() !== 'EXCLUIR') {
    return formError('Digite EXCLUIR para confirmar.', {
      confirmacao: 'Digite exatamente EXCLUIR.',
    });
  }

  const repository = await getRepository();
  await repository.deleteUserData(user.id);

  if (env.dbDriver() === 'supabase') {
    // A linha de `auth.users` só pode ser removida com service_role, que este
    // app não carrega. Os DADOS PESSOAIS já foram apagados acima; o que resta é
    // um registro de login sem conteúdo. Está documentado em /app/configuracoes
    // para ninguém achar que a exclusão foi parcial por descuido.
    const client = await createSupabaseServerClient();
    await client.auth.signOut();
  }

  const store = await cookies();
  store.delete(sessionCookie.name);
  redirect('/');
}
