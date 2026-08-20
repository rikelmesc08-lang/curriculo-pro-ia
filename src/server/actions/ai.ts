'use server';

import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { fail, ok, type AiActionResult } from '@/lib/forms/action-result';
import { parseResumeContent } from '@/lib/resume/schema';
import { aiErrorMessage } from '@/services/ai';
import {
  analyzeAts,
  analyzeJobDescription,
  generateCoverLetter,
  generateInterviewQuestions,
  generateRecruiterMessage,
  improveExperience,
  improveProfessionalSummary,
  matchResumeToJob,
  optimizeResume,
} from '@/services/ai/resume-ai';
import type {
  AiEnvelope,
  AtsAnalysis,
  CoverLetter,
  InterviewQuestion,
  JobAnalysis,
  JobMatch,
  OptimizedResume,
  RecruiterMessage,
  RecruiterMessageKind,
  RewrittenExperience,
  RewrittenText,
} from '@/types/ai';
import type { Resume } from '@/types/resume';

/**
 * Ponte entre a interface e a camada de IA.
 *
 * Nenhum componente chama `@/services/ai` diretamente: se chamasse, a chave da
 * API e o SDK entrariam no pacote do navegador. Tudo passa por estas ações.
 *
 * O CURRÍCULO VEM DO CLIENTE, e isso é intencional: a pessoa pode pedir
 * melhoria de um rascunho ainda não salvo. Por isso todo payload passa por
 * `parseResumeContent` antes de virar prompt — e o texto colado da vaga é
 * truncado na camada de serviço.
 */

const MAX_JOB_LENGTH = 20000;

/** Monta um `Resume` a partir do rascunho do cliente, sem tocar no banco. */
function draftToResume(userId: string, content: unknown): Resume {
  const parsed = parseResumeContent(content);
  const timestamp = new Date().toISOString();
  return { ...parsed, id: 'rascunho', ownerId: userId, createdAt: timestamp, updatedAt: timestamp };
}

function sanitizeJob(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, MAX_JOB_LENGTH);
}

/** Envolve a chamada convertendo qualquer erro em resultado exibível. */
async function guard<T>(run: () => Promise<AiEnvelope<T>>): Promise<AiActionResult<T>> {
  try {
    return ok(await run());
  } catch (error) {
    // Detalhe técnico fica no log do servidor; a tela recebe uma mensagem que
    // diz o que fazer a respeito.
    console.error('[ai-action]', error);
    return fail(aiErrorMessage(error));
  }
}

export async function analyzeJobAction(jobDescription: string): Promise<AiActionResult<JobAnalysis>> {
  await requireUser('/app/analisar-vaga');
  const job = sanitizeJob(jobDescription);
  if (job.trim().length < 40) {
    return fail('Cole a descrição completa da vaga — com menos de 40 caracteres não há o que analisar.');
  }
  return guard(() => analyzeJobDescription(job));
}

export async function matchResumeAction(
  content: unknown,
  jobDescription: string
): Promise<AiActionResult<JobMatch>> {
  const user = await requireUser('/app/analisar-vaga');
  const job = sanitizeJob(jobDescription);
  if (job.trim().length < 40) {
    return fail('Cole a descrição da vaga para comparar com o seu currículo.');
  }
  return guard(() => matchResumeToJob({ resume: draftToResume(user.id, content), jobDescription: job }));
}

export async function atsAnalysisAction(
  content: unknown,
  jobDescription: string
): Promise<AiActionResult<AtsAnalysis>> {
  const user = await requireUser('/app/analisar-vaga');
  return guard(() =>
    analyzeAts({ resume: draftToResume(user.id, content), jobDescription: sanitizeJob(jobDescription) })
  );
}

export async function improveSummaryAction(
  content: unknown,
  jobDescription: string
): Promise<AiActionResult<RewrittenText>> {
  const user = await requireUser('/app/curriculo');
  return guard(() =>
    improveProfessionalSummary({
      resume: draftToResume(user.id, content),
      jobDescription: sanitizeJob(jobDescription),
    })
  );
}

export async function improveExperienceAction(
  content: unknown,
  experienceId: string,
  jobDescription: string
): Promise<AiActionResult<RewrittenExperience>> {
  const user = await requireUser('/app/curriculo');
  return guard(() =>
    improveExperience({
      resume: draftToResume(user.id, content),
      experienceId,
      jobDescription: sanitizeJob(jobDescription),
    })
  );
}

export async function optimizeResumeAction(
  content: unknown,
  jobDescription: string
): Promise<AiActionResult<OptimizedResume>> {
  const user = await requireUser('/app/otimizar');
  const job = sanitizeJob(jobDescription);
  if (job.trim().length < 40) {
    return fail('Cole a descrição da vaga para adaptar o currículo a ela.');
  }
  return guard(() => optimizeResume({ resume: draftToResume(user.id, content), jobDescription: job }));
}

export async function coverLetterAction(
  content: unknown,
  jobDescription: string,
  company: string,
  role: string
): Promise<AiActionResult<CoverLetter>> {
  const user = await requireUser('/app/carta');
  return guard(() =>
    generateCoverLetter({
      resume: draftToResume(user.id, content),
      jobDescription: sanitizeJob(jobDescription),
      company: String(company ?? '').slice(0, 200),
      role: String(role ?? '').slice(0, 200),
    })
  );
}

export async function interviewQuestionsAction(
  content: unknown,
  jobDescription: string
): Promise<AiActionResult<{ questions: InterviewQuestion[] }>> {
  const user = await requireUser('/app/entrevista');
  return guard(() =>
    generateInterviewQuestions({
      resume: draftToResume(user.id, content),
      jobDescription: sanitizeJob(jobDescription),
    })
  );
}

export async function recruiterMessageAction(
  content: unknown,
  kind: RecruiterMessageKind,
  company: string,
  role: string,
  context: string
): Promise<AiActionResult<RecruiterMessage>> {
  const user = await requireUser('/app/mensagens');
  return guard(() =>
    generateRecruiterMessage({
      resume: draftToResume(user.id, content),
      kind,
      company: String(company ?? '').slice(0, 200),
      role: String(role ?? '').slice(0, 200),
      context: String(context ?? '').slice(0, 2000),
    })
  );
}

/**
 * Currículo salvo do usuário, para as telas que trabalham sobre ele sem serem
 * o editor (analisar vaga, carta, entrevista).
 */
export async function loadLatestResumeAction(): Promise<AiActionResult<Resume | null>> {
  const user = await requireUser('/app');
  try {
    const repository = await getRepository();
    const resume = await repository.getLatestResume(user.id);
    return ok({ mode: 'real', data: resume });
  } catch (error) {
    console.error('[loadLatestResumeAction]', error);
    return fail('Não conseguimos carregar seu currículo agora.');
  }
}
