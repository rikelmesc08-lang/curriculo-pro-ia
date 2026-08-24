import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { SectionTitle } from '@/components/ui/Card';
import { ResumeImportTool } from '@/components/resume/ResumeImportTool';

/**
 * Ler um PDF inteiro custa mais que reescrever um parágrafo: o documento vai
 * junto do prompt e o modelo precisa percorrê-lo antes de responder.
 *
 * Mesmo teto das outras telas de IA (60s, limite do plano gratuito da Vercel),
 * pelo mesmo motivo: sem isto vale o padrão da plataforma, menor, e a
 * funcionalidade morre em produção com erro genérico enquanto funciona
 * perfeitamente em desenvolvimento.
 */
export const maxDuration = 60;

export const metadata: Metadata = { title: 'Importar currículo' };

/**
 * Importação do currículo que a pessoa já tem.
 *
 * A página busca o currículo existente só para saber se há algo a ser
 * substituído — quem já tem um precisa ser avisado ANTES, e não descobrir
 * depois que a importação passou por cima do trabalho dele.
 */
export default async function ResumeImportPage() {
  const user = await requireUser('/app/curriculo/importar');
  const repository = await getRepository();
  const existing = await repository.getLatestResume(user.id);

  return (
    <>
      <SectionTitle
        title="Importar currículo"
        description="Já tem um currículo pronto? Envie o arquivo e a IA preenche o formulário para você conferir — sem redigitar tudo."
      />
      <ResumeImportTool existingResumeId={existing?.id ?? null} />
    </>
  );
}
