import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { SectionTitle } from '@/components/ui/Card';
import { NoResumeNotice } from '@/components/tools/ToolPieces';
import { OptimizeTool } from '@/components/tools/OptimizeTool';

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
      {resume ? <OptimizeTool resume={resume} /> : <NoResumeNotice href="/app/otimizar" />}
    </>
  );
}
