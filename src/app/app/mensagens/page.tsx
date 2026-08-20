import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { toContent } from '@/lib/resume/draft';
import { SectionTitle } from '@/components/ui/Card';
import { NoResumeNotice } from '@/components/tools/ToolPieces';
import { RecruiterMessageTool } from '@/components/tools/RecruiterMessageTool';

export const metadata: Metadata = { title: 'Mensagem para recrutador' };

export default async function RecruiterMessagePage() {
  const user = await requireUser('/app/mensagens');
  const repository = await getRepository();
  const resume = await repository.getLatestResume(user.id);

  return (
    <>
      <SectionTitle
        title="Mensagem para recrutador"
        description="Seis situações comuns, com mensagens curtas e profissionais para cada uma."
      />
      {resume ? <RecruiterMessageTool resume={toContent(resume)} /> : <NoResumeNotice tool="O gerador de mensagens" />}
    </>
  );
}
