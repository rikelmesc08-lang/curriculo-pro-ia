import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Feedback';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ATS_DISCLAIMER } from '@/types/ai';
import { FlowSteps } from './FlowSteps';

/**
 * Seções da landing page.
 *
 * Todas são componentes de servidor — não há estado nem interação aqui, só
 * conteúdo e links. Manter isso fora do bundle do cliente é o que faz a
 * primeira página abrir rápido no celular de quem está procurando emprego,
 * muitas vezes com internet ruim.
 */

function SectionShell({
  id,
  eyebrow,
  title,
  description,
  children,
  tone = 'canvas',
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  tone?: 'canvas' | 'surface';
}) {
  return (
    <section id={id} className={tone === 'surface' ? 'border-y border-line bg-surface' : ''}>
      <div className="container-page py-14 md:py-18">
        <div className="max-w-2xl">
          {eyebrow && <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">{eyebrow}</p>}
          <h2 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">{title}</h2>
          {description && <p className="mt-3 text-base leading-relaxed text-muted">{description}</p>}
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

const BENEFITS: { icon: IconName; title: string; description: string }[] = [
  {
    icon: 'documento',
    title: 'Currículo profissional',
    description: 'Organize suas experiências de maneira clara e objetiva.',
  },
  {
    icon: 'alvo',
    title: 'Análise de compatibilidade',
    description: 'Compare seu currículo com a descrição da vaga.',
  },
  {
    icon: 'chave',
    title: 'Palavras-chave',
    description: 'Identifique competências e termos importantes presentes na oportunidade.',
  },
  {
    icon: 'carta',
    title: 'Carta de apresentação',
    description: 'Crie uma carta personalizada para a vaga.',
  },
  {
    icon: 'conversa',
    title: 'Preparação para entrevista',
    description: 'Receba perguntas e sugestões de respostas baseadas na vaga.',
  },
  {
    icon: 'download',
    title: 'Download em PDF',
    description: 'Gere seu currículo pronto para enviar.',
  },
];

export function Benefits() {
  return (
    <SectionShell
      id="recursos"
      eyebrow="Recursos"
      title="Tudo que você precisa para se candidatar melhor"
      description="Cada ferramenta trabalha sobre as informações que você mesmo forneceu — do primeiro rascunho ao PDF pronto para enviar."
      tone="surface"
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map((benefit) => (
          <Card as="li" key={benefit.title} className="p-5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Icon name={benefit.icon} />
            </span>
            <h3 className="mt-3.5 text-base font-semibold text-ink">{benefit.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{benefit.description}</p>
          </Card>
        ))}
      </ul>
    </SectionShell>
  );
}

const REWRITE_FLOW = [
  { title: 'Currículo antigo', detail: 'Cole o que você já tem, mesmo que esteja desatualizado.' },
  { title: 'A IA analisa', detail: 'Estrutura, clareza, palavras-chave e aderência à vaga.' },
  { title: 'A IA melhora', detail: 'Reescreve seus textos sem alterar nenhum fato.', highlight: true },
  { title: 'Você revisa', detail: 'Nada é salvo sem a sua conferência. Você aceita ou descarta.' },
  { title: 'Currículo pronto', detail: 'Escolha o modelo e baixe em PDF.' },
];

export function HowItWorks() {
  return (
    <SectionShell
      id="como-funciona"
      eyebrow="Como funciona"
      title="Você não precisa começar do zero."
      description="Se já existe um currículo, ele é o ponto de partida. Se não existe, o formulário guiado monta um com você, campo por campo."
    >
      <FlowSteps steps={REWRITE_FLOW} />
    </SectionShell>
  );
}

const AUDIENCES = [
  { title: 'Primeiro emprego', description: 'Sem experiência registrada? Cursos, projetos e voluntariado contam — e nós ajudamos a apresentá-los.' },
  { title: 'Estágio', description: 'Formulário adaptado para quem ainda está estudando.' },
  { title: 'Troca de carreira', description: 'Destaque as competências que atravessam áreas diferentes.' },
  { title: 'Profissional experiente', description: 'Organize anos de histórico sem transformar o currículo em três páginas.' },
  { title: 'Quem está desempregado', description: 'Adapte um mesmo histórico para várias vagas, rápido.' },
  { title: 'Quem quer mudar de área', description: 'Veja o que falta para a vaga que você quer — com honestidade.' },
];

export function Audience() {
  return (
    <SectionShell
      id="para-quem"
      eyebrow="Para quem é"
      title="Feito para quem está procurando emprego"
      tone="surface"
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AUDIENCES.map((audience) => (
          <li key={audience.title} className="rounded-card border border-line bg-canvas p-5">
            <h3 className="text-base font-semibold text-ink">{audience.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{audience.description}</p>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

export function Integrity() {
  return (
    <SectionShell
      eyebrow="Integridade"
      title="A IA melhora o texto. Ela não inventa a sua história."
      description="Currículo com informação falsa não passa da entrevista — e queima a sua credibilidade. Por isso o produto tem limites explícitos."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <Badge tone="success">O que a IA faz</Badge>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-soft">
            {[
              'Reescreve suas descrições com verbos de ação e linguagem profissional',
              'Aproxima o vocabulário do que a vaga usa',
              'Reordena competências por relevância',
              'Aponta lacunas entre o seu perfil e a vaga',
              'Sugere o que estudar ou destacar',
            ].map((item) => (
              <li key={item} className="flex gap-2.5">
                <Icon name="check" className="mt-0.5 h-4 w-4 text-success" strokeWidth={2.2} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <Badge tone="danger">O que ela nunca faz</Badge>
          <ul className="mt-4 space-y-2.5 text-sm text-ink-soft">
            {[
              'Criar empresa, cargo, período ou formação que você não teve',
              'Inventar número, percentual ou resultado ("aumentei 35%")',
              'Adicionar certificação, idioma ou ferramenta que você não domina',
              'Sugerir que você omita ou distorça algo',
              'Preencher um campo vazio com suposição',
            ].map((item) => (
              <li key={item} className="flex gap-2.5">
                <Icon name="aviso" className="mt-0.5 h-4 w-4 text-danger" strokeWidth={2.2} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <p className="mt-5 text-xs leading-relaxed text-muted">{ATS_DISCLAIMER}</p>
    </SectionShell>
  );
}

const PLAN_FEATURES = [
  'Criação de currículo guiada, etapa por etapa',
  'Otimização com IA para cada vaga',
  'Análise da descrição da vaga',
  'Indicador de compatibilidade',
  'Análise ATS com recomendações',
  'Carta de apresentação personalizada',
  'Preparação para entrevista',
  'Mensagens prontas para recrutadores',
  'Cinco modelos profissionais',
  'Download em PDF',
];

/**
 * Cartão de preço da landing.
 *
 * `checkoutDisponivel` CHEGA PRONTO DO SERVIDOR, calculado uma vez em
 * `page.tsx` a partir da credencial do Mercado Pago. Este componente não lê
 * variável de ambiente nem decide nada sozinho — só mostra o que recebeu. Isso
 * evita que o selo "Em breve" fique fixo no código depois que a cobrança for
 * ligada de verdade, e evita também o erro oposto: mostrar "Disponível" numa
 * instância sem credencial configurada.
 */
export function Pricing({
  isAuthenticated,
  checkoutDisponivel,
}: {
  isAuthenticated: boolean;
  checkoutDisponivel: boolean;
}) {
  return (
    <SectionShell
      id="planos"
      eyebrow="Planos"
      title="Um plano só, sem pegadinha"
      description={
        checkoutDisponivel
          ? 'Crie e importe seu currículo sem custo. Quando quiser o diagnóstico completo e o currículo pronto para enviar, é um pagamento único, sem assinatura.'
          : 'O produto está em fase inicial e o acesso é gratuito enquanto validamos o que funciona melhor para quem está procurando emprego.'
      }
      tone="surface"
    >
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_1fr]">
        <Card className="border-brand-200 p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-ink">Acesso gratuito</h3>
            <Badge tone="success">Disponível agora</Badge>
          </div>
          <p className="mt-2 text-sm text-muted">
            {checkoutDisponivel
              ? 'Crie sua conta, monte seu currículo e veja a prévia da análise. Nenhum cartão é pedido para começar.'
              : 'Crie sua conta e use todas as ferramentas. Nenhum cartão é pedido.'}
          </p>
          <div className="mt-5">
            <ButtonLink href={isAuthenticated ? '/app' : '/cadastro'} size="lg" block className="uppercase tracking-wide">
              {isAuthenticated ? 'Ir para o painel' : 'Criar meu currículo'}
            </ButtonLink>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-ink">Plano único</h3>
            <Badge tone={checkoutDisponivel ? 'success' : 'neutral'}>
              {checkoutDisponivel ? 'Disponível agora' : 'Em breve'}
            </Badge>
          </div>
          <p className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-bold text-ink">R$ 27,90</span>
            <span className="text-sm text-muted">pagamento único</span>
          </p>
          <ul className="mt-5 space-y-2 text-sm text-ink-soft">
            {PLAN_FEATURES.map((feature) => (
              <li key={feature} className="flex gap-2.5">
                <Icon name="check" className="mt-0.5 h-4 w-4 text-brand-600" strokeWidth={2.2} />
                <span>{feature}</span>
              </li>
            ))}
          </ul>

          {checkoutDisponivel && (
            <div className="mt-5">
              <ButtonLink
                href="/app/upgrade"
                size="lg"
                block
                className="!whitespace-normal text-center uppercase tracking-wide"
              >
                Desbloquear meu currículo completo
              </ButtonLink>
            </div>
          )}

          <p className="mt-5 text-xs leading-relaxed text-muted">
            {checkoutDisponivel ? (
              <>
                Pagamento único pelo Mercado Pago, com PIX, cartão ou boleto — sem assinatura e sem
                cobrança recorrente.{' '}
                <Link href="/app/upgrade" className="font-medium text-brand-700 underline">
                  Ver detalhes do plano
                </Link>
                .
              </>
            ) : (
              <>
                O checkout ainda não está ligado: nenhuma cobrança é feita e nenhum dado de
                pagamento é coletado. Quem entrar agora será avisado antes de qualquer mudança.{' '}
                <Link href="/app/upgrade" className="font-medium text-brand-700 underline">
                  Ver detalhes do plano
                </Link>
                .
              </>
            )}
          </p>
        </Card>
      </div>
    </SectionShell>
  );
}

export function FinalCta({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <section className="bg-brand-900">
      <div className="container-page py-14 text-center md:py-16">
        <h2 className="mx-auto max-w-2xl text-2xl font-bold text-white sm:text-3xl">
          Cada vaga merece um currículo que fale a língua dela.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-brand-100">
          Monte o seu uma vez. Depois é só adaptar para cada oportunidade em poucos minutos.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink
            href={isAuthenticated ? '/app/curriculo' : '/cadastro'}
            size="lg"
            variant="secondary"
            className="uppercase tracking-wide"
          >
            Criar meu currículo
          </ButtonLink>
          <ButtonLink
            href={isAuthenticated ? '/app/analisar-vaga' : '/login'}
            size="lg"
            variant="ghost"
            className="uppercase tracking-wide !text-white hover:!bg-brand-800"
          >
            Analisar minha vaga
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
