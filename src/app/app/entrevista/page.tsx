import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { toContent } from '@/lib/resume/draft';
import { SectionTitle } from '@/components/ui/Card';
import { NoResumeNotice } from '@/components/tools/ToolPieces';
import { InterviewTool } from '@/components/tools/InterviewTool';

export const metadata: Metadata = { title: 'Preparação para entrevista' };

export default async function InterviewPage() {
  const user = await requireUser('/app/entrevista');
  const repository = await getRepository();
  const resume = await repository.getLatestResume(user.id);

  return (
    <>
      <SectionTitle
        title="Preparação para entrevista"
        description="Dez perguntas prováveis, com orientação de resposta baseada no que você realmente viveu."
      />
      {resume ? <InterviewTool resume={toContent(resume)} /> : <NoResumeNotice tool="A preparação para entrevista" />}
    </>
  );
}
