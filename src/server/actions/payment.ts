'use server';

import { requireUser } from '@/lib/auth/session';
import { env } from '@/lib/env';
import { fail, ok, type ActionResult } from '@/lib/forms/action-result';
import { anotarPreferencia, criarPagamento, listarPagamentos } from '@/lib/db/payments';
import {
  checkoutDisponivel,
  erroDeCheckoutIndisponivel,
  getPaymentProvider,
  paymentErrorMessage,
} from '@/services/payments';

/**
 * Abre o checkout e devolve para onde mandar a pessoa.
 *
 * A LINHA DE PAGAMENTO NASCE ANTES DA IDA AO PROVEDOR, e essa ordem importa: o
 * id dela viaja como `external_reference` e volta em toda notificação. É o que
 * amarra o dinheiro que entrou à conta que deve ser liberada. Criar a linha
 * depois obrigaria a adivinhar de quem é o pagamento casando valor e horário —
 * o que erra quando duas pessoas compram no mesmo minuto.
 */

/** Teto de tentativas por hora, por pessoa. */
const MAX_TENTATIVAS_HORA = 10;

export async function iniciarCheckoutAction(): Promise<ActionResult<{ url: string }>> {
  const user = await requireUser('/app/upgrade');

  if (!checkoutDisponivel()) {
    return fail(erroDeCheckoutIndisponivel().userMessage);
  }

  // Já pagou. Cobrar de novo por um produto de pagamento único seria defeito
  // caro de desfazer — e a pessoa só descobriria na fatura.
  if (user.plan === 'pro') {
    return fail('Você já tem o plano completo. Nenhuma nova cobrança é necessária.');
  }

  /**
   * Freio de abuso, contado no banco e não em memória.
   *
   * Cada clique cria um pedido no provedor. Um laço de repetição com uma conta
   * logada encheria a conta de pedidos e a nossa tabela de lixo. Contador em
   * memória não serve aqui: em plataforma serverless cada requisição pode cair
   * num processo diferente, e o limite vira decoração.
   */
  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentes = (await listarPagamentos(user.id)).filter((item) => item.createdAt > umaHoraAtras);

  if (recentes.length >= MAX_TENTATIVAS_HORA) {
    return fail('Muitas tentativas de pagamento em pouco tempo. Espere alguns minutos e tente de novo.');
  }

  const provider = getPaymentProvider();
  const amountCents = env.checkoutPriceCents();

  const pagamento = await criarPagamento({
    ownerId: user.id,
    provider: provider.name,
    amountCents,
  });

  try {
    const sessao = await provider.createCheckout({
      paymentId: pagamento.id,
      amountCents,
      title: 'CurrículoPro IA — acesso completo',
      returnUrl: `${env.siteUrl()}/app/upgrade?retorno=1`,
      notificationUrl: `${env.siteUrl()}/api/pagamento/webhook`,
      payerEmail: user.email,
    });

    await anotarPreferencia(pagamento.id, sessao.ref);
    return ok({ url: sessao.url });
  } catch (erro) {
    // A linha fica no banco como `pendente` e nunca vira `pago` — o webhook só
    // liquida o que o provedor confirmar. Apagá-la aqui destruiria o rastro de
    // quem tentou pagar e não conseguiu, que é o suporte mais difícil de fazer
    // sem registro.
    console.error('[checkout]', erro);
    return fail(paymentErrorMessage(erro));
  }
}
