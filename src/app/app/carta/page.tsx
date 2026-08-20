import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { toContent } from '@/lib/resume/draft';
import { SectionTitle } from '@/components/ui/Card';
import { NoResumeNotice } from '@/components/tools/ToolPieces';
import { CoverLetterTool } from '@/components/tools/CoverLetterTool';

export const metadata: Metadata = { title: 'Carta de apresentação' };

export default async function CoverLetterPage() {
  const user = await requireUser('/app/carta');
  const repository = await getRepository();
  const resume = await repository.getLatestResume(user.id);

  return (
    <>
      <SectionTitle
        title="Carta de apresentação"
        description="Uma carta curta e específica para a vaga, escrita a partir do seu histórico real."
      />
      {resume ? <CoverLetterTool resume={toContent(resume)} /> : <NoResumeNotice tool="A carta de apresentação" />}
    </>
  );
}
