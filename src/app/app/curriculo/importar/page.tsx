import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { SectionTitle } from '@/components/ui/Card';
import { ferramentaPor, RETORNO_PADRAO, rotaDeRetorno } from '@/components/layout/AppNav';
import { ResumeImportTool } from '@/components/resume/ResumeImportTool';

/**
 * Ler um PDF inteiro custa mais que reescrever um parágrafo: o documento vai
 * junto do prompt e o modelo precisa percorrê-lo antes de responder.
 *
 * Mesmo teto das outras telas de IA (60s, limite do plano gratuito da Vercel),
 * pelo mesmo motivo: sem isto vale o padrão da plataforma, menor, e a
 * funcionalidade morre em produção com erro genérico enquanto funciona
 * perfeitamente em desenvolvimento.
 */
export const maxDuration = 60;

export const metadata: Metadata = { title: 'Importar currículo' };

/**
 * Importação do currículo que a pessoa já tem.
 *
 * A página busca o currículo existente só para saber se há algo a ser
 * substituído — quem já tem um precisa ser avisado ANTES, e não descobrir
 * depois que a importação passou por cima do trabalho dele.
 */
export default async function ResumeImportPage({
  searchParams,
}: PageProps<'/app/curriculo/importar'>) {
  const user = await requireUser('/app/curriculo/importar');
  const repository = await getRepository();
  const existing = await repository.getLatestResume(user.id);

  /**
   * De onde a pessoa veio, e para onde ela volta.
   *
   * `rotaDeRetorno` valida contra a lista de ferramentas e devolve
   * `/app/curriculo` para qualquer coisa que não esteja nela — inclusive um
   * endereço externo que alguém tenha tentado injetar na URL. O componente
   * recebe o valor JÁ validado; ele nunca vê o parâmetro cru.
   */
  const params = await searchParams;
  const destino = rotaDeRetorno(params.voltar);
  const origem = destino === RETORNO_PADRAO ? undefined : ferramentaPor(destino);

  return (
    <>
      <SectionTitle
        title="Importar currículo"
        description={
          // Dizer o destino ANTES muda o que a tela é: sem isto, importar
          // parece um desvio que interrompeu o que a pessoa ia fazer. Com
          // isto, é um passo do caminho que ela já escolheu.
          origem
            ? `Envie o arquivo e a IA preenche o formulário para você conferir — sem redigitar tudo. Ao terminar, você volta para ${origem.label}.`
            : 'Já tem um currículo pronto? Envie o arquivo e a IA preenche o formulário para você conferir — sem redigitar tudo.'
        }
      />
      <ResumeImportTool existingResumeId={existing?.id ?? null} destino={destino} />
    </>
  );
}
