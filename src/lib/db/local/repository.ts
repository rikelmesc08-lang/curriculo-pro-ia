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

  async countAiCalls(ownerId, since) {
    return read(
      (db) => db.aiCalls.filter((call) => call.ownerId === ownerId && call.createdAt >= since).length
    );
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
    await mutate((db) => {
      db.aiCalls.push({
        id: randomUUID(),
        ownerId,
        task: entry.task,
        fingerprint: entry.fingerprint,
        result: entry.result,
        createdAt: now(),
      });

      // Poda no momento da escrita. Sem isto o db.json cresce para sempre com
      // registros que nenhuma consulta alcança mais — e este arquivo é lido
      // inteiro a cada operação.
      const cutoff = new Date(Date.now() - LOCAL_AI_RETENTION_MS).toISOString();
      db.aiCalls = db.aiCalls.filter((call) => call.createdAt >= cutoff);
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
