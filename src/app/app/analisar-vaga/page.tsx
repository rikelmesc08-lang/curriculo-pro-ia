import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { toContent } from '@/lib/resume/draft';
import { SectionTitle } from '@/components/ui/Card';
import { NoResumeNotice } from '@/components/tools/ToolPieces';
import { JobAnalysisTool } from '@/components/tools/JobAnalysisTool';

export const metadata: Metadata = { title: 'Analisar vaga' };

export default async function AnalyzeJobPage() {
  const user = await requireUser('/app/analisar-vaga');
  const repository = await getRepository();
  const resume = await repository.getLatestResume(user.id);

  return (
    <>
      <SectionTitle
        title="Analisar vaga"
        description="Descubra o que a vaga pede, quanto o seu currículo já atende e o que dá para melhorar com honestidade."
      />
      {resume ? (
        <JobAnalysisTool resume={toContent(resume)} />
      ) : (
        <NoResumeNotice tool="A análise de compatibilidade" />
      )}
    </>
  );
}
