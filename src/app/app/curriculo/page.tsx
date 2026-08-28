import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { emptyResumeContent } from '@/types/resume';
import { toContent } from '@/lib/resume/draft';
import { SectionTitle } from '@/components/ui/Card';
import { ferramentaPor, RETORNO_PADRAO, rotaDeRetorno } from '@/components/layout/AppNav';
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
export default async function ResumeBuilderPage({ searchParams }: PageProps<'/app/curriculo'>) {
  const user = await requireUser('/app/curriculo');
  const repository = await getRepository();
  const existing = await repository.getLatestResume(user.id);

  /**
   * De onde a pessoa veio, quando veio de uma ferramenta.
   *
   * O caminho é: clicou em "Analisar currículo" sem ter currículo → importou →
   * caiu AQUI para conferir o que a IA leu. Sem este parâmetro, a intenção
   * original morre no formulário e ela precisa lembrar sozinha para onde ia.
   *
   * `rotaDeRetorno` valida contra a lista de ferramentas e devolve
   * `/app/curriculo` para qualquer outra coisa — inclusive um endereço externo
   * injetado na URL. Ver a defesa contra redirecionamento aberto em
   * `AppNav.ts`. Aqui o valor validado só vira o `href` de um link, mas passar
   * pela mesma porta é o que garante que ele nunca aponte para fora.
   */
  const params = await searchParams;
  const ferramenta = rotaDeRetorno(params.voltar);
  const volta = ferramenta === RETORNO_PADRAO ? undefined : ferramentaPor(ferramenta);

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
        O caminho de volta para a ferramenta que a pessoa queria usar.

        Fica NO TOPO e não no fim do formulário de propósito: ele não é um
        "próximo passo" a ser alcançado depois de percorrer tudo, é uma saída
        disponível a qualquer momento. Quem só precisava corrigir o cargo que a
        IA não conseguiu ler tem que poder voltar em dois cliques, sem rolar
        quatro etapas atrás de um botão.

        Não some depois de editar, e não deveria: o formulário salva sozinho, e
        a pessoa pode ir e voltar quantas vezes quiser.

        O TÍTULO NÃO INTERPOLA O NOME DA FERRAMENTA, e isso é deliberado.
        Metade dos rótulos não é verbo: "antes de analisar currículo" lê bem,
        mas "antes de carta de apresentação" e "antes de mensagem para
        recrutador" não são português. O nome da ferramenta aparece onde cabe
        naturalmente — no botão ("Voltar para Carta de apresentação").

        E EXIGE `existing`, não só `volta`. O texto afirma que os dados vieram
        de um arquivo enviado; sem currículo salvo, essa afirmação é falsa.
        No fluxo real as duas condições andam juntas — a pessoa chega aqui logo
        depois de importar —, mas basta abrir a URL com `?voltar=` na mão para
        a mensagem mentir. Sem esta condição, o aviso ainda aparecia ao lado do
        "Já tem um currículo pronto?", que só existe quando NÃO há currículo:
        duas caixas dizendo o contrário uma da outra na mesma tela.
      */}
      {volta && existing && (
        <Alert tone="info" title="Confira o que foi lido antes de continuar" className="mb-5">
          <p>
            Os dados abaixo vieram do arquivo que você enviou, e a leitura automática erra — junta
            colunas, troca datas, deixa campo em branco. Corrija o que estiver errado; o formulário
            salva sozinho a cada mudança.
          </p>
          <ButtonLink href={volta.href} size="sm" className="mt-3">
            Voltar para {volta.label}
          </ButtonLink>
        </Alert>
      )}

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
