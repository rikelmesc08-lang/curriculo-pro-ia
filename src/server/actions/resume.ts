'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { fail, ok, type ActionResult } from '@/lib/forms/action-result';
import { parseResumeContent } from '@/lib/resume/schema';

/**
 * Ações do currículo.
 *
 * Só função async é exportada daqui — a diretiva `"use server"` transforma cada
 * export num endpoint HTTP, e um `export const` passaria por tsc, lint e build
 * para só quebrar no clique do usuário.
 *
 * TODA ação começa por `requireUser()` e passa o `id` da sessão ao repositório.
 * O `ownerId` NUNCA vem do cliente: se viesse, bastaria trocá-lo no payload
 * para ler o currículo de outra pessoa.
 */

export interface SavedResume {
  id: string;
  updatedAt: string;
}

export async function saveResumeAction(
  resumeId: string | null,
  content: unknown
): Promise<ActionResult<SavedResume>> {
  const user = await requireUser('/app/curriculo');

  const parsed = parseResumeContent(content);
  const repository = await getRepository();

  try {
    if (resumeId) {
      const updated = await repository.updateResume(user.id, resumeId, parsed);
      // `null` aqui significa "não existe OU não é seu" — a mesma resposta nos
      // dois casos, de propósito: distinguir revelaria a existência do id.
      if (!updated) return fail('Currículo não encontrado.');
      revalidatePath('/app');
      return ok({ id: updated.id, updatedAt: updated.updatedAt });
    }

    const created = await repository.createResume(user.id, parsed);
    revalidatePath('/app');
    return ok({ id: created.id, updatedAt: created.updatedAt });
  } catch (error) {
    // A mensagem técnica fica no log do servidor; o usuário recebe algo que
    // ele possa agir a respeito.
    console.error('[saveResumeAction]', error);
    return fail('Não conseguimos salvar agora. Seu texto continua na tela — tente de novo em instantes.');
  }
}

/**
 * Aplica ao currículo salvo uma otimização gerada para uma vaga.
 *
 * A MESCLAGEM É DEFENSIVA POR CONSTRUÇÃO, e é aqui que a regra de integridade
 * do produto vira código em vez de instrução em prompt:
 *
 *   - experiências são casadas por `id`. Um `id` que não existe no currículo é
 *     descartado — o modelo não consegue criar uma experiência nova por esta
 *     via, mesmo que tente;
 *   - `skillsOrder` só REORDENA. Nome que não está entre as competências
 *     cadastradas é ignorado, então a IA não consegue acrescentar uma
 *     habilidade que a pessoa nunca declarou;
 *   - formação, certificações, idiomas e dados pessoais não são tocados.
 *
 * Se o prompt falhar em segurar o modelo, esta função ainda segura.
 */
export async function applyOptimizationAction(
  resumeId: string,
  optimization: {
    summary?: string;
    experiences?: { id: string; description: string; responsibilities: string[]; achievements: string[] }[];
    skillsOrder?: string[];
  }
): Promise<ActionResult<SavedResume>> {
  const user = await requireUser('/app/otimizar');
  const repository = await getRepository();

  const current = await repository.getResume(user.id, resumeId);
  if (!current) return fail('Currículo não encontrado.');

  const byId = new Map((optimization.experiences ?? []).map((item) => [item.id, item]));

  const experiences = current.experiences.map((experience) => {
    const proposal = byId.get(experience.id);
    if (!proposal) return experience;
    return {
      ...experience,
      description: proposal.description,
      responsibilities: proposal.responsibilities,
      achievements: proposal.achievements,
    };
  });

  const order = optimization.skillsOrder ?? [];
  const position = new Map(order.map((name, index) => [name.toLowerCase(), index]));
  const skills = [...current.skills].sort((a, b) => {
    // Competência fora da lista de ordenação vai para o fim, preservando a
    // ordem relativa original — nada é removido.
    const left = position.get(a.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const right = position.get(b.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  });

  const content = parseResumeContent({
    ...current,
    goal: { ...current.goal, summary: optimization.summary?.trim() || current.goal.summary },
    experiences,
    skills,
  });

  try {
    const updated = await repository.updateResume(user.id, resumeId, content);
    if (!updated) return fail('Currículo não encontrado.');
    revalidatePath('/app');
    revalidatePath('/app/curriculo');
    return ok({ id: updated.id, updatedAt: updated.updatedAt });
  } catch (error) {
    console.error('[applyOptimizationAction]', error);
    return fail('Não conseguimos aplicar a otimização agora. Tente de novo.');
  }
}

export async function deleteResumeAction(resumeId: string): Promise<ActionResult<null>> {
  const user = await requireUser('/app/curriculo');
  const repository = await getRepository();

  try {
    await repository.deleteResume(user.id, resumeId);
    revalidatePath('/app');
    return ok(null);
  } catch (error) {
    console.error('[deleteResumeAction]', error);
    return fail('Não conseguimos excluir o currículo agora.');
  }
}
