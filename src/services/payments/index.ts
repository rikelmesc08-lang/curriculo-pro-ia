import 'server-only';

import { env } from '@/lib/env';
import { mercadoPagoProvider } from './mercadopago';
import { PaymentError, type PaymentProvider } from './provider';

export { PaymentError } from './provider';
export type { CheckoutSession, PaymentProvider, PaymentSnapshot } from './provider';

/**
 * Escolha do provedor de pagamento.
 *
 * NÃO EXISTE MODO DEMONSTRAÇÃO AQUI, e a ausência é deliberada.
 *
 * A IA tem modo demonstração porque um texto de exemplo, carimbado como
 * exemplo, é honesto e útil. Pagamento não tem equivalente: um checkout "de
 * mentira" só poderia fazer duas coisas, e as duas são piores que não existir.
 * Se liberar o plano sem cobrar, vira porta dos fundos — e ela vai acabar
 * ligada em produção por engano, num arquivo `.env` copiado. Se não liberar
 * nada, é um botão que falha depois do clique, gastando a confiança de quem
 * estava disposto a pagar.
 *
 * Então: sem credencial, o checkout é INDISPONÍVEL e a tela diz isso na cara,
 * do mesmo jeito que o exportador de DOCX faz neste projeto.
 */
export function getPaymentProvider(): PaymentProvider {
  return mercadoPagoProvider;
}

/** O checkout pode ser oferecido? Ver `checkoutIndisponivel` para o motivo. */
export function checkoutDisponivel(): boolean {
  return getPaymentProvider().available && Boolean(env.mercadoPagoWebhookSecret());
}

/**
 * Por que o checkout não está disponível — para o log, nunca para a tela.
 *
 * O SEGREDO DO WEBHOOK ENTRA NA CONTA junto com o token, e não é excesso de
 * zelo: com token e sem segredo, o checkout funcionaria, a pessoa pagaria de
 * verdade, e a notificação chegaria sem poder ser verificada. Ou recusaríamos
 * quem pagou, ou aceitaríamos qualquer POST que soubesse a URL. Vender antes de
 * conseguir confirmar a venda é o pior estado possível deste sistema — pior,
 * inclusive, que não vender.
 */
export function motivoDeIndisponibilidade(): string | null {
  if (!env.mercadoPagoAccessToken()) return 'MERCADOPAGO_ACCESS_TOKEN ausente';
  if (!env.mercadoPagoWebhookSecret()) return 'MERCADOPAGO_WEBHOOK_SECRET ausente';
  return null;
}

/** Mensagem única para quem tentar pagar com o checkout desligado. */
export function erroDeCheckoutIndisponivel(): PaymentError {
  return new PaymentError(
    'configuracao',
    motivoDeIndisponibilidade() ?? 'checkout indisponível',
    'O pagamento ainda não está ativo. Nenhuma cobrança foi feita e todas as ferramentas continuam abertas.'
  );
}

/** Converte qualquer erro em mensagem exibível, sem vazar detalhe interno. */
export function paymentErrorMessage(erro: unknown): string {
  if (erro instanceof PaymentError) return erro.userMessage;
  return 'Não conseguimos iniciar o pagamento agora. Tente de novo em instantes.';
}
