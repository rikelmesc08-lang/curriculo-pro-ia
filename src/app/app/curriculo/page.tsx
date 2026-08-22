import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { emptyResumeContent } from '@/types/resume';
import { toContent } from '@/lib/resume/draft';
import { SectionTitle } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { ResumeBuilder } from '@/components/resume/ResumeBuilder';

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

      {/*
        Só para quem está começando do zero.
        A oferta some assim que existe currículo salvo: aí importar deixaria de
        ser um atalho e passaria a ser risco de a pessoa apagar o próprio
        trabalho sem perceber. E quem já preencheu o formulário não precisa mais
        saber que a importação existe.
      */}
      {!existing && (
        <Alert tone="info" title="Já tem um currículo pronto?" className="mb-5">
          <p>Não precisa digitar tudo de novo — envie o PDF e a IA preenche este formulário para você conferir.</p>
          <ButtonLink href="/app/curriculo/importar" variant="secondary" size="sm" className="mt-3">
            Enviar meu currículo pronto
          </ButtonLink>
        </Alert>
      )}

      <ResumeBuilder initialId={existing?.id ?? null} initialContent={initialContent} />
    </>
  );
}
