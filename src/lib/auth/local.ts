import 'server-only';

import { randomUUID } from 'node:crypto';
import { mutate, read, type StoredUser } from '@/lib/db/local/store';
import { hashPassword, precisaRehash, verifyPassword } from './password';
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
      sessionVersion: 0,
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

  // MIGRAÇÃO DE CUSTO. O login é a única janela em que a senha em texto
  // existe, e portanto a única em que dá para regravar o hash com os
  // parâmetros novos. Sem isto, endurecer o scrypt só protegeria contas
  // criadas depois da mudança — as antigas ficariam no custo velho para
  // sempre, sem nada indicando isso.
  //
  // A falha aqui não pode derrubar um login legítimo: se a regravação der
  // errado, a pessoa entra com o hash antigo e tentamos de novo na próxima.
  if (precisaRehash(user.passwordHash)) {
    try {
      await rehashLocalPassword(user.id, input.password);
    } catch (error) {
      console.error('[authenticateLocalUser] falha ao migrar o hash', error);
    }
  }

  return { ok: true, user };
}

/**
 * Regrava o hash com o custo atual, SEM verificar a senha de novo e SEM
 * incrementar `sessionVersion`.
 *
 * Uso restrito à migração de custo dentro de `authenticateLocalUser`: ali a
 * senha em texto já acabou de ser verificada pelo login, e o objetivo é só
 * trocar o formato de armazenamento — não uma troca de senha de verdade. Se
 * isto incrementasse `sessionVersion`, TODO LOGIN que disparasse a migração
 * derrubaria as demais sessões do próprio usuário sem ele ter pedido.
 */
async function rehashLocalPassword(userId: string, password: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return mutate((db) => {
    const user = db.users.find((candidate) => candidate.id === userId);
    if (!user) return false;
    user.passwordHash = passwordHash;
    return true;
  });
}

export type ChangeLocalPasswordResult =
  | { ok: true; sessionVersion: number }
  | { ok: false; reason: 'usuario-nao-encontrado' | 'senha-atual-incorreta' };

/**
 * Troca a senha de um usuário local já autenticado.
 *
 * Exige e confere a SENHA ATUAL antes de trocar — sem isto, quem obtém a
 * sessão (dispositivo destravado, cookie roubado) trocaria a senha sem
 * conhecer a antiga e trancaria o dono para fora. A comparação usa
 * `verifyPassword`, a mesma função de tempo constante do login; não é uma
 * segunda implementação.
 *
 * Sucesso incrementa `sessionVersion`: é o valor que `changePasswordAction`
 * usa para emitir um cookie novo só para o navegador que pediu a troca,
 * derrubando qualquer outro cookie em circulação no próximo pedido dele. Ver
 * `readLocalSession`/`createLocalSessionValue` em `./session-cookie`.
 */
export async function changeLocalPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<ChangeLocalPasswordResult> {
  const user = await read((db) => db.users.find((candidate) => candidate.id === userId));
  if (!user) return { ok: false, reason: 'usuario-nao-encontrado' };

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) return { ok: false, reason: 'senha-atual-incorreta' };

  const passwordHash = await hashPassword(newPassword);

  const sessionVersion = await mutate((db) => {
    const target = db.users.find((candidate) => candidate.id === userId);
    // Não deveria acontecer entre a leitura acima e esta escrita (a fila do
    // driver local serializa tudo), mas se a conta sumir no meio do caminho
    // o retorno precisa refletir isso, não inventar uma versão.
    if (!target) return null;
    target.passwordHash = passwordHash;
    target.sessionVersion = (target.sessionVersion ?? 0) + 1;
    return target.sessionVersion;
  });

  if (sessionVersion === null) return { ok: false, reason: 'usuario-nao-encontrado' };
  return { ok: true, sessionVersion };
}

/**
 * Versão de sessão atual do usuário, para conferência contra o cookie.
 * `null` quando o usuário não existe (mais) — cookie de conta apagada.
 */
export async function getLocalSessionVersion(userId: string): Promise<number | null> {
  const user = await read((db) => db.users.find((candidate) => candidate.id === userId));
  return user ? (user.sessionVersion ?? 0) : null;
}
