import 'server-only';

import type { AiCallRecord } from '@/types/ai';
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

  /**
   * Quantas chamadas de IA o usuário fez desde `since` (ISO 8601).
   *
   * É o que sustenta o limite de uso. Fica no repositório, e não numa variável
   * em memória, porque em plataforma serverless cada requisição pode cair num
   * processo diferente — um contador em memória zera sozinho e o limite vira
   * decoração.
   *
   * `upTo`, se informado, transforma esta contagem em "posição na fila": em
   * vez de contar TODA a janela, conta só as linhas cuja posição em
   * `(createdAt, id)` seja menor ou igual à de `upTo`. É o que faz de
   * `recordAiCall` uma SENHA DE FILA em vez de só uma gravação — ver o
   * comentário de topo de `src/server/ai-budget.ts`. Sem `upTo`, uma rajada de
   * N reservas verdadeiramente paralelas faria TODAS contarem a janela
   * inteira (N), todas veriam `N > limite` e todas seriam recusadas — mesmo
   * as que, em ordem de chegada, tinham direito de passar. Com `upTo`, cada
   * reserva só enxerga quem chegou até ela mesma, e as `limite` primeiras
   * passam de verdade.
   */
  countAiCalls(ownerId: string, since: string, upTo?: { createdAt: string; id: string }): Promise<number>;
  /** Resposta guardada para a mesma pergunta, se ainda estiver dentro da janela. */
  findAiCall(ownerId: string, fingerprint: string, since: string): Promise<AiCallRecord | null>;
  /**
   * Registra a chamada e guarda a resposta. Ver `src/server/ai-budget.ts`.
   *
   * Devolve `id` E `createdAt` da linha criada. O `id` é o que permite desfazer
   * a reserva (`deleteAiCall`) se o limite acabar sendo estourado ou se a
   * chamada não tiver saído (`configuracao`/`cota`). O `createdAt` é o que
   * transforma a reserva numa SENHA DE FILA: junto com o `id`, ele vira o
   * `upTo` passado para `countAiCalls`, e é essa dupla — não o `id` sozinho —
   * que define a posição exata da reserva entre as concorrentes.
   */
  recordAiCall(
    ownerId: string,
    entry: { task: string; fingerprint: string; result: unknown }
  ): Promise<{ id: string; createdAt: string }>;
  /**
   * Apaga UM registro de chamada de IA, por id.
   *
   * Existe para desfazer uma RESERVA (ver `src/server/ai-budget.ts`): a linha
   * que reservou a cota antes de rodar a IA precisa sumir quando a reserva não
   * vira uma chamada de verdade — limite estourado, ou erro que não chegou a
   * sair (`configuracao`/`cota`). Filtra por `ownerId` pelo mesmo motivo de
   * todo método deste contrato: um `id` sozinho não é suficiente para apagar o
   * registro de outra pessoa.
   */
  deleteAiCall(ownerId: string, id: string): Promise<void>;

  listApplications(ownerId: string): Promise<Application[]>;
  createApplication(ownerId: string, input: ApplicationInput): Promise<Application>;
  updateApplication(ownerId: string, id: string, input: Partial<ApplicationInput>): Promise<Application | null>;
  deleteApplication(ownerId: string, id: string): Promise<void>;
}
