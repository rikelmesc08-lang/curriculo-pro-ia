'use server';

import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { env } from '@/lib/env';
import { fail, ok, type AiActionResult } from '@/lib/forms/action-result';
import { parseResumeContent } from '@/lib/resume/schema';
import { capInput, runWithBudget } from '@/server/ai-budget';
import { aiErrorMessage } from '@/services/ai';
import { toDelivery } from '@/services/ai/review-gate';
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
  reviewResume,
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
  ReviewDelivery,
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

/**
 * O currículo sem os campos que mudam a cada requisição.
 *
 * `draftToResume` carimba `createdAt` e `updatedAt` com a hora atual, porque o
 * tipo `Resume` os exige. Se esses campos entrassem na impressão digital do
 * cache, cada clique geraria uma chave nova e o cache nunca acertaria uma vez
 * sequer — um cache que só grava é só desperdício de disco.
 *
 * Nada aqui altera o que vai para o prompt: é só a identidade da pergunta.
 */
function resumeKey(resume: Resume): unknown {
  return { ...resume, id: '', ownerId: '', createdAt: '', updatedAt: '' };
}

/** Monta um `Resume` a partir do rascunho do cliente, sem tocar no banco. */
function draftToResume(userId: string, content: unknown): Resume {
  const parsed = parseResumeContent(content);
  const timestamp = new Date().toISOString();
  return { ...parsed, id: 'rascunho', ownerId: userId, createdAt: timestamp, updatedAt: timestamp };
}

function sanitizeJob(value: unknown): string {
  return capInput(value, MAX_JOB_LENGTH);
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
  const user = await requireUser('/app/analisar-vaga');
  const job = sanitizeJob(jobDescription);
  if (job.trim().length < 40) {
    return fail('Cole a descrição completa da vaga — com menos de 40 caracteres não há o que analisar.');
  }
  return guard(() =>
    runWithBudget(user.id, 'analyzeJobDescription', { job }, () => analyzeJobDescription(job))
  );
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
  const resume = draftToResume(user.id, content);
  return guard(() =>
    runWithBudget(user.id, 'matchResumeToJob', { resume: resumeKey(resume), job }, () =>
      matchResumeToJob({ resume, jobDescription: job })
    )
  );
}

export async function atsAnalysisAction(
  content: unknown,
  jobDescription: string
): Promise<AiActionResult<AtsAnalysis>> {
  const user = await requireUser('/app/analisar-vaga');
  const resume = draftToResume(user.id, content);
  const job = sanitizeJob(jobDescription);
  return guard(() =>
    runWithBudget(user.id, 'analyzeAts', { resume: resumeKey(resume), job }, () =>
      analyzeAts({ resume, jobDescription: job })
    )
  );
}

export async function improveSummaryAction(
  content: unknown,
  jobDescription: string
): Promise<AiActionResult<RewrittenText>> {
  const user = await requireUser('/app/curriculo');
  const resume = draftToResume(user.id, content);
  const job = sanitizeJob(jobDescription);
  return guard(() =>
    runWithBudget(user.id, 'improveProfessionalSummary', { resume: resumeKey(resume), job }, () =>
      improveProfessionalSummary({ resume, jobDescription: job })
    )
  );
}

export async function improveExperienceAction(
  content: unknown,
  experienceId: string,
  jobDescription: string
): Promise<AiActionResult<RewrittenExperience>> {
  const user = await requireUser('/app/curriculo');
  const resume = draftToResume(user.id, content);
  const job = sanitizeJob(jobDescription);
  return guard(() =>
    runWithBudget(
      user.id,
      'improveExperience',
      { resume: resumeKey(resume), experienceId, job },
      () => improveExperience({ resume, experienceId, jobDescription: job })
    )
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
  const resume = draftToResume(user.id, content);
  return guard(() =>
    runWithBudget(user.id, 'optimizeResume', { resume: resumeKey(resume), job }, () =>
      optimizeResume({ resume, jobDescription: job })
    )
  );
}

export async function coverLetterAction(
  content: unknown,
  jobDescription: string,
  company: string,
  role: string
): Promise<AiActionResult<CoverLetter>> {
  const user = await requireUser('/app/carta');
  const resume = draftToResume(user.id, content);
  const input = {
    jobDescription: sanitizeJob(jobDescription),
    company: capInput(company, 200),
    role: capInput(role, 200),
  };
  return guard(() =>
    runWithBudget(user.id, 'generateCoverLetter', { resume: resumeKey(resume), ...input }, () =>
      generateCoverLetter({ resume, ...input })
    )
  );
}

export async function interviewQuestionsAction(
  content: unknown,
  jobDescription: string
): Promise<AiActionResult<{ questions: InterviewQuestion[] }>> {
  const user = await requireUser('/app/entrevista');
  const resume = draftToResume(user.id, content);
  const job = sanitizeJob(jobDescription);
  return guard(() =>
    runWithBudget(user.id, 'generateInterviewQuestions', { resume: resumeKey(resume), job }, () =>
      generateInterviewQuestions({ resume, jobDescription: job })
    )
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
  const resume = draftToResume(user.id, content);
  const input = {
    kind,
    company: capInput(company, 200),
    role: capInput(role, 200),
    context: capInput(context, 2000),
  };
  return guard(() =>
    runWithBudget(user.id, 'generateRecruiterMessage', { resume: resumeKey(resume), ...input }, () =>
      generateRecruiterMessage({ resume, ...input })
    )
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

/**
 * Análise completa do currículo.
 *
 * É a única ação que devolve `ReviewDelivery` em vez do resultado direto, e o
 * motivo está em `src/services/ai/review-gate.ts`: o corte entre a prévia
 * gratuita e o resultado completo acontece AQUI, no servidor, antes de virar
 * resposta. Quem está no plano gratuito recebe um objeto que nunca conteve o
 * texto pago — não há nada escondido no navegador para alguém encontrar.
 *
 * O resultado completo é guardado no cache mesmo quando só a prévia é
 * entregue. Assim, no dia em que a pessoa desbloquear, o texto já existe: ela
 * vê o resultado na hora e a IA não é chamada uma segunda vez pela mesma
 * pergunta.
 */
export async function resumeReviewAction(
  content: unknown,
  jobDescription: string
): Promise<AiActionResult<ReviewDelivery>> {
  const user = await requireUser('/app/analise');
  const resume = draftToResume(user.id, content);
  const job = sanitizeJob(jobDescription);

  try {
    const envelope = await runWithBudget(
      user.id,
      'reviewResume',
      { resume: resumeKey(resume), job },
      () => reviewResume({ resume, jobDescription: job })
    );

    return ok({
      mode: envelope.mode,
      notice: envelope.notice,
      cached: envelope.cached,
      data: toDelivery(envelope.data, {
        plan: user.plan,
        paywallEnabled: env.aiPaywallEnabled(),
      }),
    });
  } catch (error) {
    console.error('[ai-action]', error);
    return fail(aiErrorMessage(error));
  }
}
