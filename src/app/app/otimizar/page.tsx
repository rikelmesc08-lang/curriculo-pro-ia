import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { SectionTitle } from '@/components/ui/Card';
import { NoResumeNotice } from '@/components/tools/ToolPieces';
import { OptimizeTool } from '@/components/tools/OptimizeTool';

export const metadata: Metadata = { title: 'Otimizar currículo' };

export default async function OptimizePage() {
  const user = await requireUser('/app/otimizar');
  const repository = await getRepository();
  const resume = await repository.getLatestResume(user.id);

  return (
    <>
      <SectionTitle
        title="Otimizar currículo"
        description="Gere uma versão do seu currículo direcionada a uma vaga específica. Você revisa antes de qualquer coisa ser salva."
      />
      {resume ? <OptimizeTool resume={resume} /> : <NoResumeNotice tool="A otimização" />}
    </>
  );
}
