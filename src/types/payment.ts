/**
 * Uma tentativa de compra.
 *
 * A LINHA NASCE ANTES DE EXISTIR PAGAMENTO, no momento em que mandamos a
 * pessoa para o provedor. Guardar só o que foi pago perderia a única pista de
 * quem tentou e não conseguiu — e é justamente essa pessoa que escreve para o
 * suporte.
 */

/**
 * Situação da compra, no nosso vocabulário.
 *
 * NÃO É O VOCABULÁRIO DO PROVEDOR, de propósito. O Mercado Pago tem
 * `approved`, `in_process`, `rejected`, `refunded`, `charged_back` e mais; o
 * Stripe tem outros nomes. Traduzir na borda mantém o resto do produto sem
 * saber quem processa o pagamento — e uma troca de provedor não vira uma
 * caçada por strings soltas pelo código.
 *
 * `pendente` cobre tudo que ainda pode virar pago, inclusive o PIX esperando
 * compensação e a análise antifraude do cartão.
 */
export type PaymentStatus = 'pendente' | 'pago' | 'recusado' | 'cancelado' | 'estornado';

/** Estados que NÃO mudam mais. Ver `podeTransicionar`. */
const FINAIS: PaymentStatus[] = ['pago', 'estornado'];

export interface Payment {
  id: string;
  ownerId: string;
  provider: string;
  /** Id do "pedido" no provedor, criado antes de existir pagamento. */
  preferenceRef: string | null;
  /** Id do pagamento em si. Nulo enquanto ninguém pagou. */
  paymentRef: string | null;
  status: PaymentStatus;
  amountCents: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Uma notificação atrasada pode desfazer o que já foi decidido?
 *
 * O PROBLEMA É REAL E CHEGA COMO SUPORTE: notificações de provedor chegam fora
 * de ordem. A do "pendente" pode aterrissar DEPOIS da do "aprovado" — e
 * processada sem critério, ela rebaixaria uma compra já paga, tirando o acesso
 * de alguém que pagou.
 *
 * Então "pago" só cede lugar para "estornado", que é a única notícia posterior
 * que importa de verdade. Nenhuma notificação atrasada volta atrás num
 * pagamento confirmado.
 */
export function podeTransicionar(atual: PaymentStatus, novo: PaymentStatus): boolean {
  if (atual === novo) return false;
  if (atual === 'estornado') return false;
  if (atual === 'pago') return novo === 'estornado';
  return !FINAIS.includes(atual);
}

/** "R$ 27,90" a partir de centavos. */
export function precoEmReais(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
