import 'server-only';

import { randomUUID } from 'node:crypto';
import { mutate, read, type StoredUser } from '@/lib/db/local/store';
import { hashPassword, verifyPassword } from './password';
import { normalizeEmail } from './validation';

/**
 * Cadastro e login do driver local.
 *
 * Isto fica FORA da interface `Repository` de propósito: no driver Supabase
 * quem cuida de credencial é o Supabase Auth, e a interface de dados não
 * deveria ter um método `createUser(senha)` que só um dos drivers implementa.
 */

export type LocalAuthResult =
  | { ok: true; user: StoredUser }
  | { ok: false; reason: 'email-em-uso' | 'credenciais-invalidas' };

export async function createLocalUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<LocalAuthResult> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);

  return mutate((db) => {
    const existing = db.users.find((user) => user.email === email);
    if (existing) return { ok: false as const, reason: 'email-em-uso' as const };

    const user: StoredUser = {
      id: randomUUID(),
      email,
      name: input.name,
      plan: 'gratuito',
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    return { ok: true as const, user };
  });
}

export async function authenticateLocalUser(input: {
  email: string;
  password: string;
}): Promise<LocalAuthResult> {
  const email = normalizeEmail(input.email);
  const user = await read((db) => db.users.find((candidate) => candidate.email === email));

  // Mesmo com e-mail inexistente rodamos uma verificação: sem isso, o tempo de
  // resposta diferencia "e-mail não cadastrado" de "senha errada" e vira um
  // oráculo para descobrir quem tem conta aqui.
  const hash = user?.passwordHash ?? (await hashPassword('senha-inexistente-para-igualar-o-tempo'));
  const valid = await verifyPassword(input.password, hash);

  if (!user || !valid) return { ok: false, reason: 'credenciais-invalidas' };
  return { ok: true, user };
}

/** Troca a senha de um usuário local já autenticado. */
export async function changeLocalPassword(userId: string, newPassword: string): Promise<boolean> {
  const passwordHash = await hashPassword(newPassword);
  return mutate((db) => {
    const user = db.users.find((candidate) => candidate.id === userId);
    if (!user) return false;
    user.passwordHash = passwordHash;
    return true;
  });
}
