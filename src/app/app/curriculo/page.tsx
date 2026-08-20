import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { emptyResumeContent } from '@/types/resume';
import { toContent } from '@/lib/resume/draft';
import { SectionTitle } from '@/components/ui/Card';
import { ResumeBuilder } from '@/components/resume/ResumeBuilder';

export const metadata: Metadata = { title: 'Meu currículo' };

/**
 * Criador de currículo.
 *
 * Carrega o currículo mais recente da pessoa ou começa um em branco. O produto
 * trabalha com um currículo principal por usuário — variação por vaga é
 * gerada em `/app/otimizar`, sem multiplicar documentos que depois ninguém
 * lembra qual é qual.
 */
export default async function ResumeBuilderPage() {
  const user = await requireUser('/app/curriculo');
  const repository = await getRepository();
  const existing = await repository.getLatestResume(user.id);

  const initialContent = existing
    ? toContent(existing)
    : {
        ...emptyResumeContent(),
        // Pré-preenche o que já sabemos da conta. É informação que a própria
        // pessoa forneceu no cadastro — não é a IA inventando dado.
        personal: { ...emptyResumeContent().personal, fullName: user.name, email: user.email },
      };

  return (
    <>
      <SectionTitle
        title="Crie seu currículo"
        description="Preencha etapa por etapa. Tudo é salvo automaticamente, e a pré-visualização mostra o resultado em tempo real."
      />
      <ResumeBuilder initialId={existing?.id ?? null} initialContent={initialContent} />
    </>
  );
}
