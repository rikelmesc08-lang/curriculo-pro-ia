import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { SectionTitle } from '@/components/ui/Card';
import { NoResumeNotice } from '@/components/tools/ToolPieces';
import { ResumeReviewTool } from '@/components/tools/ResumeReviewTool';

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

export const metadata: Metadata = { title: 'Analisar currículo' };

/**
 * Análise completa do currículo.
 *
 * Recebe o `Resume` inteiro, e não só o conteúdo, porque a tela precisa do `id`
 * para poder aplicar a versão otimizada no documento salvo.
 */
export default async function ResumeReviewPage() {
  const user = await requireUser('/app/analise');
  const repository = await getRepository();
  const resume = await repository.getLatestResume(user.id);

  return (
    <>
      <SectionTitle
        title="Analisar currículo"
        description="Um diagnóstico completo do seu currículo: nota, o que está errado, o que dá para melhorar e a versão reescrita do seu texto."
      />
      {resume ? (
        <ResumeReviewTool resume={resume} />
      ) : (
        <NoResumeNotice href="/app/analise" />
      )}
    </>
  );
}
