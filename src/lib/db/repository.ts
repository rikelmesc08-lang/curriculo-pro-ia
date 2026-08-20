import 'server-only';

import type { Application, ApplicationInput } from '@/types/application';
import type { Resume, ResumeContent } from '@/types/resume';
import type { AppUser } from '@/types/user';

/**
 * Contrato único de persistência.
 *
 * Todo acesso a dado passa por aqui. A UI e as Server Actions não conhecem
 * Supabase nem sistema de arquivos — conhecem estes doze métodos. É o que
 * permite rodar o app sem conta em serviço nenhum durante o desenvolvimento e
 * trocar para Postgres em produção sem tocar em tela.
 *
 * TODO MÉTODO RECEBE `ownerId` E FILTRA POR ELE. Não existe "buscar currículo
 * por id" sem dono: currículo carrega nome, telefone e e-mail de uma pessoa
 * real, e um `id` adivinhado não pode virar vazamento. No driver Supabase a
 * RLS repete essa checagem no banco — cinto e suspensório, de propósito.
 */
export interface Repository {
  findUserById(id: string): Promise<AppUser | null>;
  updateUser(id: string, patch: Partial<Pick<AppUser, 'name' | 'plan'>>): Promise<AppUser | null>;
  /** Apaga o usuário e TUDO que pertence a ele. Ver `/app/configuracoes`. */
  deleteUserData(id: string): Promise<void>;

  listResumes(ownerId: string): Promise<Resume[]>;
  getResume(ownerId: string, id: string): Promise<Resume | null>;
  /** Currículo mais recente do usuário, ou `null` se ele ainda não criou nenhum. */
  getLatestResume(ownerId: string): Promise<Resume | null>;
  createResume(ownerId: string, content: ResumeContent): Promise<Resume>;
  updateResume(ownerId: string, id: string, content: ResumeContent): Promise<Resume | null>;
  deleteResume(ownerId: string, id: string): Promise<void>;

  listApplications(ownerId: string): Promise<Application[]>;
  createApplication(ownerId: string, input: ApplicationInput): Promise<Application>;
  updateApplication(ownerId: string, id: string, input: Partial<ApplicationInput>): Promise<Application | null>;
  deleteApplication(ownerId: string, id: string): Promise<void>;
}
