import type { PaymentStatus } from '@/types/payment';

/**
 * Tradução do vocabulário do Mercado Pago para o nosso.
 *
 * SEPARADO DO ADAPTADOR de propósito: é lógica pura, é onde mora o risco de
 * classificar errado, e é o que precisa de teste sem rede. Chamar `approved` de
 * pendente adia o acesso de quem pagou; chamar `in_process` de pago libera o
 * produto antes de o dinheiro existir.
 *
 * O DESCONHECIDO CAI EM `pendente`, e essa escolha é deliberada. Um status que
 * o provedor criar depois desta linha ser escrita não pode virar acesso
 * liberado por acidente — e também não pode virar recusa, que tiraria o acesso
 * de alguém por causa de uma palavra nova. Pendente é o único desfecho que não
 * causa dano em nenhuma das duas direções.
 */

const MAPA: Record<string, PaymentStatus> = {
  // Dinheiro confirmado. É o único que libera o plano.
  approved: 'pago',

  // Ainda pode virar pago: PIX aguardando compensação, boleto não vencido,
  // cartão em análise antifraude.
  pending: 'pendente',
  in_process: 'pendente',
  in_mediation: 'pendente',
  // `authorized` é cartão com valor reservado e NÃO capturado. Não é dinheiro
  // nosso ainda.
  authorized: 'pendente',

  rejected: 'recusado',
  cancelled: 'cancelado',

  refunded: 'estornado',
  charged_back: 'estornado',
};

export function traduzirStatus(bruto: unknown): PaymentStatus {
  if (typeof bruto !== 'string') return 'pendente';
  return MAPA[bruto.trim().toLowerCase()] ?? 'pendente';
}

/** Só isto libera o plano pago. Existe para o teste poder afirmar a lista. */
export function liberaPlano(status: PaymentStatus): boolean {
  return status === 'pago';
}
