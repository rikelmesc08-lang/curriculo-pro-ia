import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { toContent } from '@/lib/resume/draft';
import { SectionTitle } from '@/components/ui/Card';
import { NoResumeNotice } from '@/components/tools/ToolPieces';
import { RecruiterMessageTool } from '@/components/tools/RecruiterMessageTool';

/**
 * A análise de IA leva ~22s. Sem isto vale o teto padrão da plataforma, que em
 * alguns planos é menor — e a funcionalidade morreria em produção com erro
 * genérico, funcionando perfeitamente em desenvolvimento.
 *
 * 60s é o teto do plano gratuito da Vercel. O tempo limite do cliente HTTP em
 * `services/ai/gemini.ts` é MENOR de propósito (55s), para a nossa mensagem de
 * erro — que diz o que fazer — chegar antes de a plataforma cortar com a dela.
 */
export const maxDuration = 60;

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
