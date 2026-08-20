import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, SectionTitle } from '@/components/ui/Card';
import { Alert, Badge } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { AnalyticsEvent } from '@/components/analytics/AnalyticsEvent';

export const metadata: Metadata = { title: 'Plano' };

const INCLUDED = [
  'Criação de currículo guiada, etapa por etapa',
  'Otimização com IA para cada vaga',
  'Análise da descrição da vaga',
  'Indicador de compatibilidade',
  'Análise ATS com recomendações',
  'Carta de apresentação personalizada',
  'Preparação para entrevista',
  'Mensagens prontas para recrutadores',
  'Cinco modelos profissionais legíveis por ATS',
  'Download em PDF',
];

/**
 * Tela de plano e checkout.
 *
 * O CHECKOUT NÃO EXISTE AINDA, e a tela diz isso na cara. A alternativa —
 * colocar um botão "Assinar" que abre um formulário de cartão de mentira, ou
 * que não faz nada — seria enganar alguém que está procurando emprego e
 * contando os trocados. Quando a plataforma de pagamento for escolhida e as
 * credenciais existirem, o botão abaixo passa a apontar para o checkout real.
 */
export default async function UpgradePage() {
  const user = await requireUser('/app/upgrade');

  return (
    <>
      <AnalyticsEvent event="checkout_started" />
      <SectionTitle title="Plano" description="O que está incluído e como a cobrança vai funcionar." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-brand-200">
          <CardHeader
            title="Seu acesso hoje"
            action={<Badge tone="success">Ativo</Badge>}
          />
          <CardBody className="space-y-3">
            <p className="text-sm leading-relaxed text-ink-soft">
              Você tem acesso completo a todas as ferramentas, sem custo. O produto está em fase
              inicial e queremos entender o que funciona antes de cobrar por isso.
            </p>
            <p className="text-sm leading-relaxed text-ink-soft">
              Plano atual: <strong className="font-semibold text-ink">{user.plan === 'pro' ? 'Pro' : 'Gratuito'}</strong>
            </p>
            <ButtonLink href="/app/curriculo" className="uppercase tracking-wide">
              Continuar meu currículo
            </ButtonLink>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Plano único" action={<Badge tone="neutral">Em breve</Badge>} />
          <CardBody>
            <p className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-ink">R$ 27,90</span>
              <span className="text-sm text-muted">pagamento único</span>
            </p>

            <ul className="mt-5 space-y-2 text-sm text-ink-soft">
              {INCLUDED.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <Icon name="check" className="mt-0.5 h-4 w-4 text-brand-600" strokeWidth={2.2} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <Alert tone="info" className="mt-5" title="O pagamento ainda não está ativo">
              Nenhuma cobrança é feita, nenhum dado de cartão é pedido e nenhum recurso está
              bloqueado. Quando a cobrança for ligada, quem já usa o produto será avisado antes.
            </Alert>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
