'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { formError, formSuccess, text, type FormState } from '@/lib/forms/state';
import type { ApplicationInput } from '@/types/application';

/**
 * Ações do acompanhamento de candidaturas.
 *
 * Usam `FormState` e `<form action>` em vez de estado no cliente: são
 * formulários curtos, e assim continuam funcionando antes de o JavaScript
 * carregar — no celular, num 3G ruim, isso é a diferença entre registrar a
 * candidatura e perder o registro.
 */

const applicationSchema = z.object({
  company: z.string().trim().min(1, 'Informe a empresa.').max(200),
  role: z.string().trim().min(1, 'Informe o cargo.').max(200),
  appliedAt: z.string().trim().max(30).default(''),
  status: z.enum(['aplicado', 'em-analise', 'entrevista', 'aprovado', 'reprovado']).default('aplicado'),
  link: z.string().trim().max(600).default(''),
  notes: z.string().trim().max(2000).default(''),
});

function readForm(formData: FormData) {
  return applicationSchema.safeParse({
    company: text(formData, 'company'),
    role: text(formData, 'role'),
    appliedAt: text(formData, 'appliedAt'),
    status: text(formData, 'status') || 'aplicado',
    link: text(formData, 'link'),
    notes: text(formData, 'notes'),
  });
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

export async function createApplicationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser('/app/candidaturas');
  const parsed = readForm(formData);
  if (!parsed.success) {
    return formError('Confira os campos destacados.', fieldErrors(parsed.error));
  }

  try {
    const repository = await getRepository();
    await repository.createApplication(user.id, parsed.data as ApplicationInput);
    revalidatePath('/app/candidaturas');
    revalidatePath('/app');
    return formSuccess('Candidatura registrada.');
  } catch (error) {
    console.error('[createApplicationAction]', error);
    return formError('Não conseguimos salvar a candidatura agora. Tente de novo.');
  }
}

export async function updateApplicationStatusAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser('/app/candidaturas');
  const id = text(formData, 'id');
  const status = text(formData, 'status');

  const parsed = z
    .enum(['aplicado', 'em-analise', 'entrevista', 'aprovado', 'reprovado'])
    .safeParse(status);
  if (!id || !parsed.success) return formError('Status inválido.');

  try {
    const repository = await getRepository();
    const updated = await repository.updateApplication(user.id, id, { status: parsed.data });
    if (!updated) return formError('Candidatura não encontrada.');
    revalidatePath('/app/candidaturas');
    revalidatePath('/app');
    return formSuccess();
  } catch (error) {
    console.error('[updateApplicationStatusAction]', error);
    return formError('Não conseguimos atualizar o status agora.');
  }
}

export async function deleteApplicationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser('/app/candidaturas');
  const id = text(formData, 'id');
  if (!id) return formError('Candidatura não encontrada.');

  try {
    const repository = await getRepository();
    await repository.deleteApplication(user.id, id);
    revalidatePath('/app/candidaturas');
    revalidatePath('/app');
    return formSuccess('Candidatura removida.');
  } catch (error) {
    console.error('[deleteApplicationAction]', error);
    return formError('Não conseguimos remover a candidatura agora.');
  }
}
