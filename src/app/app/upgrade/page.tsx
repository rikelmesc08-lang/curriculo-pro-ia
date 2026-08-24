import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { listarPagamentos } from '@/lib/db/payments';
import { checkoutDisponivel } from '@/services/payments';
import { precoEmReais } from '@/types/payment';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, SectionTitle } from '@/components/ui/Card';
import { Alert, Badge } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { CheckoutButton } from '@/components/upgrade/CheckoutButton';

export const metadata: Metadata = { title: 'Plano' };

const INCLUDED = [
  'Criação de currículo guiada, etapa por etapa',
  'Importação do currículo que você já tem, por PDF ou foto',
  'Análise completa com nota e problemas apontados',
  'Currículo marcado em PDF, com cada problema no lugar onde ele está',
  'Currículo reescrito em PDF, pronto para enviar',
  'Otimização com IA para cada vaga',
  'Análise da descrição da vaga e indicador de compatibilidade',
  'Carta de apresentação personalizada',
  'Preparação para entrevista',
  'Mensagens prontas para recrutadores',
  'Cinco modelos profissionais legíveis por ATS',
];

/**
 * Tela de plano e checkout.
 *
 * A TELA MUDA DE FORMA CONFORME O CHECKOUT ESTÁ CONFIGURADO OU NÃO, e isso é o
 * ponto: enquanto não há credencial, ela DIZ que a cobrança não está ativa em
 * vez de mostrar um botão que falha depois do clique. A versão anterior era
 * inteira assim, e o comentário que estava aqui continua valendo — enganar
 * alguém que está procurando emprego e contando os trocados é o pior desfecho
 * possível desta página.
 */
export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ retorno?: string }>;
}) {
  const user = await requireUser('/app/upgrade');
  const { retorno } = await searchParams;

  const disponivel = checkoutDisponivel();
  const preco = precoEmReais(env.checkoutPriceCents());
  const jaEhPro = user.plan === 'pro';

  /**
   * VOLTANDO DO PAGAMENTO, O PLANO PODE AINDA NÃO TER MUDADO — e isso é normal,
   * não é defeito. Quem libera o acesso é o webhook, e ele chega por fora, em
   * segundos ou minutos. PIX então costuma demorar mais que o clique de volta.
   *
   * Dizer isso é obrigatório: sem o aviso, a pessoa que acabou de pagar vê
   * "Plano: Gratuito" e conclui que perdeu o dinheiro.
   */
  const aguardandoConfirmacao = retorno === '1' && !jaEhPro;

  const compras = await listarPagamentos(user.id);
  const ultima = compras[0];

  return (
    <>
      <SectionTitle title="Plano" description="O que está incluído e como a cobrança funciona." />

      {aguardandoConfirmacao && (
        <Alert tone="info" title="Estamos confirmando seu pagamento" className="mb-5">
          <p>
            Se você concluiu o pagamento, a liberação acontece assim que o Mercado Pago confirmar —
            costuma levar alguns segundos no cartão e um pouco mais no PIX e no boleto. Você não
            precisa pagar de novo. Atualize esta página em instantes.
          </p>
          {ultima && (
            <p className="mt-2 text-xs text-muted">
              Última tentativa registrada: {ultima.status}, em{' '}
              {new Date(ultima.createdAt).toLocaleString('pt-BR')}.
            </p>
          )}
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-brand-200">
          <CardHeader
            title="Seu acesso hoje"
            action={<Badge tone={jaEhPro ? 'success' : 'neutral'}>{jaEhPro ? 'Completo' : 'Gratuito'}</Badge>}
          />
          <CardBody className="space-y-3">
            {jaEhPro ? (
              <p className="text-sm leading-relaxed text-ink-soft">
                Você tem o acesso completo, sem prazo para acabar. Obrigado por apoiar o produto.
              </p>
            ) : disponivel ? (
              <p className="text-sm leading-relaxed text-ink-soft">
                Você pode criar e importar currículo, e ver a prévia da análise com a nota e os
                problemas mais graves. A versão completa do diagnóstico e o currículo reescrito
                estão no plano ao lado.
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-ink-soft">
                Você tem acesso completo a todas as ferramentas, sem custo. O produto está em fase
                inicial e queremos entender o que funciona antes de cobrar por isso.
              </p>
            )}

            <ButtonLink href="/app/curriculo" variant={jaEhPro ? 'primary' : 'secondary'}>
              Continuar meu currículo
            </ButtonLink>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Plano único"
            action={<Badge tone={disponivel ? 'success' : 'neutral'}>{disponivel ? 'Disponível' : 'Em breve'}</Badge>}
          />
          <CardBody>
            <p className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-ink">{preco}</span>
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

            <div className="mt-5">
              {jaEhPro ? (
                <Alert tone="success" title="Já é seu">
                  Este plano já está liberado na sua conta. Nenhuma nova cobrança será feita.
                </Alert>
              ) : disponivel ? (
                <CheckoutButton priceLabel={preco} />
              ) : (
                <Alert tone="info" title="O pagamento ainda não está ativo">
                  Nenhuma cobrança é feita, nenhum dado de cartão é pedido e nenhum recurso está
                  bloqueado. Quando a cobrança for ligada, quem já usa o produto será avisado antes.
                </Alert>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {compras.length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Suas compras" description="Toda tentativa de pagamento fica registrada aqui." />
          <CardBody>
            <ul className="divide-y divide-line text-sm">
              {compras.slice(0, 5).map((compra) => (
                <li key={compra.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{precoEmReais(compra.amountCents)}</p>
                    <p className="text-xs text-muted">
                      {new Date(compra.createdAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <Badge tone={compra.status === 'pago' ? 'success' : compra.status === 'pendente' ? 'neutral' : 'danger'}>
                    {compra.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}
