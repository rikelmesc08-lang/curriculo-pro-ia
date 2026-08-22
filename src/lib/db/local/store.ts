import 'server-only';

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { env } from '@/lib/env';
import type { StoredPasswordReset } from '@/lib/auth/reset';
import type { AiCallRecord } from '@/types/ai';
import type { Application } from '@/types/application';
import type { Resume } from '@/types/resume';

/**
 * Banco de desenvolvimento: um arquivo JSON.
 *
 * POR QUE JSON E NÃO SQLITE: SQLite traz binário nativo, que precisa casar com
 * a versão do Node e falha de formas obscuras no Windows. O objetivo aqui é
 * que `npm run dev` funcione no primeiro try, sem conta em serviço nenhum e
 * sem etapa de compilação. Volume esperado é de um punhado de registros por
 * pessoa — JSON dá conta com folga.
 *
 * O QUE ISTO NÃO É: banco de produção. `assertDriverAllowed()` recusa o driver
 * local fora de desenvolvimento, porque disco de plataforma serverless some
 * entre deploys e o usuário perderia o currículo sem ver erro nenhum.
 */

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  plan: 'gratuito' | 'pro';
  /** `scrypt` com sal por usuário. Ver `src/lib/auth/password.ts`. */
  passwordHash: string;
  createdAt: string;
}

export interface DatabaseShape {
  version: 1;
  users: StoredUser[];
  resumes: Resume[];
  applications: Application[];
  /** Contador de uso e cache da IA. Ver `src/server/ai-budget.ts`. */
  aiCalls: AiCallRecord[];
  /** Tokens de recuperação de senha. Ver `src/lib/auth/reset.ts`. */
  passwordResets: StoredPasswordReset[];
}

function emptyDatabase(): DatabaseShape {
  return { version: 1, users: [], resumes: [], applications: [], aiCalls: [], passwordResets: [] };
}

function databasePath(): string {
  return resolve(process.cwd(), join(env.localDataDir(), 'db.json'));
}

/**
 * Serializa as escritas.
 *
 * Duas Server Actions podem rodar ao mesmo tempo. Sem esta fila, "ler, alterar,
 * gravar" de duas requisições se sobrepõe e a segunda grava por cima do que a
 * primeira acabou de escrever — o clássico lost update. A fila é por processo,
 * o que basta: o driver local roda numa máquina só, por definição.
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  // A fila não pode morrer por causa de um erro numa tarefa anterior.
  queue = result.catch(() => undefined);
  return result;
}

async function readDatabase(): Promise<DatabaseShape> {
  try {
    const raw = await readFile(databasePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<DatabaseShape>;
    return {
      version: 1,
      users: parsed.users ?? [],
      resumes: parsed.resumes ?? [],
      applications: parsed.applications ?? [],
      // Ausentes nos bancos gravados antes destas colunas existirem. Ler como
      // lista vazia migra o arquivo sozinho, sem script e sem quebrar quem já
      // tinha dado em disco.
      aiCalls: parsed.aiCalls ?? [],
      passwordResets: parsed.passwordResets ?? [],
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return emptyDatabase();
    // JSON corrompido é erro de verdade: melhor falhar alto do que apagar
    // silenciosamente o trabalho de quem estava testando.
    throw error;
  }
}

async function writeDatabase(data: DatabaseShape): Promise<void> {
  const path = databasePath();
  await mkdir(dirname(path), { recursive: true });
  // Grava em arquivo temporário e renomeia: se o processo morrer no meio, o
  // db.json antigo continua íntegro em vez de virar um JSON pela metade.
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2), 'utf8');
  await rename(temporary, path);
}

/** Leitura consistente com as escritas em andamento. */
export function read<T>(selector: (data: DatabaseShape) => T): Promise<T> {
  return enqueue(async () => selector(await readDatabase()));
}

/** Lê, deixa o callback alterar e grava. O callback devolve o valor de retorno. */
export function mutate<T>(mutator: (data: DatabaseShape) => T | Promise<T>): Promise<T> {
  return enqueue(async () => {
    const data = await readDatabase();
    const result = await mutator(data);
    await writeDatabase(data);
    return result;
  });
}
