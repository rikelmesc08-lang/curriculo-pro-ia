import 'server-only';

import { randomUUID } from 'node:crypto';
import type { Repository } from '@/lib/db/repository';
import { mutate, read, type StoredUser } from './store';
import type { Application, ApplicationInput } from '@/types/application';
import type { Resume, ResumeContent } from '@/types/resume';
import type { AppUser } from '@/types/user';

/** Remove o hash de senha antes de qualquer coisa sair desta camada. */
export function toAppUser(user: StoredUser): AppUser {
  return { id: user.id, email: user.email, name: user.name, plan: user.plan, createdAt: user.createdAt };
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Por quanto tempo o driver local guarda registro de chamada de IA.
 *
 * Trinta dias cobre com folga a maior janela configurável de cache
 * (`AI_CACHE_MINUTES`, teto de 30 dias) e a janela diária do limite de uso.
 * Registro mais velho que isso não é lido por consulta nenhuma.
 */
const LOCAL_AI_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A linha está dentro da janela E até a posição `upTo` na fila?
 *
 * Extraído porque `countAiCalls` e `reserveAiCall` PRECISAM concordar: se as
 * duas contarem por critérios diferentes, o mesmo usuário recebe um teto
 * quando o banco tem a função atômica e outro quando cai no caminho antigo —
 * e a diferença só apareceria em produção, sob rajada.
 *
 * A comparação é de tupla `(createdAt, id)`, não só de `createdAt`: o
 * timestamp tem precisão de milissegundo e várias reservas concorrentes podem
 * cair no mesmo instante. Sem o desempate por `id` elas empatariam na mesma
 * posição, e mais de uma se veria como "a 1ª da fila" — furando o teto
 * exatamente no caso que a senha de fila existe para fechar.
 */
function ateAPosicao(
  call: { ownerId: string; createdAt: string; id: string },
  ownerId: string,
  since: string,
  upTo?: { createdAt: string; id: string }
): boolean {
  if (call.ownerId !== ownerId || call.createdAt < since) return false;
  if (!upTo) return true;
  if (call.createdAt < upTo.createdAt) return true;
  if (call.createdAt > upTo.createdAt) return false;
  return call.id <= upTo.id;
}

export const localRepository: Repository = {
  async findUserById(id) {
    const user = await read((db) => db.users.find((candidate) => candidate.id === id));
    return user ? toAppUser(user) : null;
  },

  async updateUser(id, patch) {
    return mutate((db) => {
      const user = db.users.find((candidate) => candidate.id === id);
      if (!user) return null;
      if (patch.name !== undefined) user.name = patch.name;
      if (patch.plan !== undefined) user.plan = patch.plan;
      return toAppUser(user);
    });
  },

  async deleteUserData(id) {
    await mutate((db) => {
      db.users = db.users.filter((user) => user.id !== id);
      db.resumes = db.resumes.filter((resume) => resume.ownerId !== id);
      db.applications = db.applications.filter((application) => application.ownerId !== id);
      // O cache guarda texto derivado do currículo da pessoa. "Apagar minha
      // conta" precisa levar isto junto, senão a exclusão é parcial e a
      // promessa da tela de configurações vira mentira.
      db.aiCalls = db.aiCalls.filter((call) => call.ownerId !== id);
      db.passwordResets = db.passwordResets.filter((reset) => reset.userId !== id);
    });
  },

  async countAiCalls(ownerId, since, upTo) {
    return read((db) => db.aiCalls.filter((call) => ateAPosicao(call, ownerId, since, upTo)).length);
  },

  /**
   * Reserva e conta as duas janelas dentro de UM `mutate`.
   *
   * O driver local já fechava esta corrida sem função nenhuma: `store.ts`
   * serializa toda leitura e escrita numa fila só, então o INSERT e as
   * contagens nunca se intercalavam. Implementar o método aqui não conserta
   * nada que estivesse quebrado — serve para que os dois drivers percorram o
   * MESMO caminho em `ai-budget.ts`, e para que a suíte (que roda toda no
   * driver local) exercite esse caminho de verdade, incluindo os dois testes
   * de rajada paralela. Um método implementado só no Supabase seria um
   * caminho de produção sem cobertura nenhuma.
   *
   * NUNCA DEVOLVE `null`: o `null` do contrato significa "o banco não sabe
   * fazer isso agora", e um arquivo JSON sempre sabe.
   */
  async reserveAiCall(ownerId, entry, janela) {
    const id = randomUUID();
    const createdAt = now();

    return mutate((db) => {
      db.aiCalls.push({
        id,
        ownerId,
        task: entry.task,
        fingerprint: entry.fingerprint,
        result: {},
        createdAt,
      });

      const cutoff = new Date(Date.now() - LOCAL_AI_RETENTION_MS).toISOString();
      db.aiCalls = db.aiCalls.filter((call) => call.createdAt >= cutoff);

      // CONTAGEM SIMPLES, SEM `upTo` — e isso é o ponto desta função.
      //
      // O caminho antigo precisa comparar `(createdAt, id)` porque as reservas
      // concorrentes não estão serializadas: cada uma tem que descobrir a
      // própria posição sem saber quantas outras vieram. Só que essa
      // comparação NÃO ordena por inserção: `createdAt` tem precisão de
      // milissegundo e o `id` é um UUID ALEATÓRIO, então duas reservas no
      // mesmo milissegundo saem na ordem do sorteio. A que entrou primeiro
      // pode ter o id maior — aí a segunda não a conta, as duas se veem na
      // posição 1, e as duas passam.
      //
      // Aqui isso não acontece porque não há o que desempatar: este bloco roda
      // dentro de um `mutate`, e `store.ts` serializa toda operação numa fila
      // só. Quando ele executa, TODAS as reservas anteriores já estão no
      // array e nenhuma posterior entrou. "Quantas linhas existem na janela"
      // já É a posição desta reserva na fila, com a própria incluída.
      //
      // É a mesma razão pela qual a função de banco não compara tupla: lá a
      // serialização vem da trava por usuário, aqui vem da fila do arquivo.
      const naJanela = (desde: string) =>
        db.aiCalls.filter((call) => ateAPosicao(call, ownerId, desde)).length;

      return {
        id,
        createdAt,
        usedInHour: naJanela(janela.desdeHora),
        usedInDay: naJanela(janela.desdeDia),
      };
    });
  },

  async findAiCall(ownerId, fingerprint, since) {
    const found = await read((db) =>
      db.aiCalls
        .filter(
          (call) =>
            call.ownerId === ownerId && call.fingerprint === fingerprint && call.createdAt >= since
        )
        // O mais recente: se a janela cobre dois registros iguais, o que vale é
        // o último, não o primeiro que aparecer no arquivo.
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    );
    return found ?? null;
  },

  async recordAiCall(ownerId, entry) {
    const id = randomUUID();
    const createdAt = now();
    await mutate((db) => {
      db.aiCalls.push({
        id,
        ownerId,
        task: entry.task,
        fingerprint: entry.fingerprint,
        result: entry.result,
        createdAt,
      });

      // Poda no momento da escrita. Sem isto o db.json cresce para sempre com
      // registros que nenhuma consulta alcança mais — e este arquivo é lido
      // inteiro a cada operação.
      const cutoff = new Date(Date.now() - LOCAL_AI_RETENTION_MS).toISOString();
      db.aiCalls = db.aiCalls.filter((call) => call.createdAt >= cutoff);
    });
    // `createdAt` é gerado ANTES do `mutate` (não dentro dele) para ser
    // exatamente o valor gravado na linha — devolvê-lo é o que permite ao
    // chamador (`ai-budget.ts`) usar esta reserva como `upTo` de
    // `countAiCalls`, isto é, como senha de fila.
    return { id, createdAt };
  },

  async deleteAiCall(ownerId, id) {
    await mutate((db) => {
      db.aiCalls = db.aiCalls.filter((call) => !(call.id === id && call.ownerId === ownerId));
    });
  },

  async listResumes(ownerId) {
    return read((db) =>
      db.resumes
        .filter((resume) => resume.ownerId === ownerId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    );
  },

  async getResume(ownerId, id) {
    const resume = await read((db) =>
      db.resumes.find((candidate) => candidate.id === id && candidate.ownerId === ownerId)
    );
    return resume ?? null;
  },

  async getLatestResume(ownerId) {
    const resumes = await this.listResumes(ownerId);
    return resumes[0] ?? null;
  },

  async createResume(ownerId, content) {
    const timestamp = now();
    const resume: Resume = { ...content, id: randomUUID(), ownerId, createdAt: timestamp, updatedAt: timestamp };
    await mutate((db) => {
      db.resumes.push(resume);
    });
    return resume;
  },

  async updateResume(ownerId, id, content: ResumeContent) {
    return mutate((db) => {
      const index = db.resumes.findIndex(
        (candidate) => candidate.id === id && candidate.ownerId === ownerId
      );
      if (index === -1) return null;
      const updated: Resume = {
        ...db.resumes[index],
        ...content,
        id,
        ownerId,
        updatedAt: now(),
      };
      db.resumes[index] = updated;
      return updated;
    });
  },

  async deleteResume(ownerId, id) {
    await mutate((db) => {
      db.resumes = db.resumes.filter(
        (resume) => !(resume.id === id && resume.ownerId === ownerId)
      );
    });
  },

  async listApplications(ownerId) {
    return read((db) =>
      db.applications
        .filter((application) => application.ownerId === ownerId)
        .sort((a, b) => (b.appliedAt || b.createdAt).localeCompare(a.appliedAt || a.createdAt))
    );
  },

  async createApplication(ownerId, input: ApplicationInput) {
    const timestamp = now();
    const application: Application = {
      ...input,
      id: randomUUID(),
      ownerId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await mutate((db) => {
      db.applications.push(application);
    });
    return application;
  },

  async updateApplication(ownerId, id, input) {
    return mutate((db) => {
      const index = db.applications.findIndex(
        (candidate) => candidate.id === id && candidate.ownerId === ownerId
      );
      if (index === -1) return null;
      const updated: Application = { ...db.applications[index], ...input, updatedAt: now() };
      db.applications[index] = updated;
      return updated;
    });
  },

  async deleteApplication(ownerId, id) {
    await mutate((db) => {
      db.applications = db.applications.filter(
        (application) => !(application.id === id && application.ownerId === ownerId)
      );
    });
  },
};
