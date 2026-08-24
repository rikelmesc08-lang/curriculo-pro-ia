import type { PaymentStatus } from '@/types/payment';

/**
 * Contrato do provedor de pagamento.
 *
 * MESMO PADRÃO DO EXPORTADOR E DO PROVEDOR DE IA deste projeto: a tela pede um
 * checkout, recebe uma URL, e não sabe quem processa o dinheiro. Trocar de
 * provedor é escrever outro adaptador, não caçar strings pelo código.
 *
 * O QUE NUNCA ENTRA AQUI: dado de cartão. Todo provedor suportado usa checkout
 * HOSPEDADO — a pessoa digita o cartão no domínio dele, não no nosso. Isso não
 * é comodidade, é o que mantém este produto fora do alcance das exigências de
 * quem armazena dado de cartão, e o que garante que um defeito nosso não pode
 * vazar um número de cartão que nunca passou por aqui.
 */

export type PaymentErrorKind =
  /** Falta credencial. O checkout fica indisponível e a tela diz isso. */
  | 'configuracao'
  /** O provedor respondeu erro, ou não respondeu. */
  | 'provedor'
  /** A resposta veio, mas sem o que precisamos dela. */
  | 'resposta';

export class PaymentError extends Error {
  constructor(
    readonly kind: PaymentErrorKind,
    /** Detalhe técnico. Vai para o log, NUNCA para a tela. */
    message: string,
    /** O que a pessoa lê. Sem jargão e sem id interno. */
    readonly userMessage: string
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export interface CheckoutInput {
  /** Nossa linha de pagamento. Volta na notificação como `external_reference`. */
  paymentId: string;
  amountCents: number;
  /** Título que a pessoa vê na tela do provedor. */
  title: string;
  /** Para onde o provedor devolve a pessoa depois de pagar. */
  returnUrl: string;
  /** Para onde o provedor manda a notificação de mudança de status. */
  notificationUrl: string;
  /** E-mail de quem está comprando, para o provedor preencher o formulário. */
  payerEmail?: string;
}

export interface CheckoutSession {
  /** Id do pedido no provedor. */
  ref: string;
  /** Para onde mandar a pessoa. */
  url: string;
}

/** O que sabemos de um pagamento depois de perguntar ao provedor. */
export interface PaymentSnapshot {
  /** Id do pagamento no provedor. */
  ref: string;
  status: PaymentStatus;
  /** O `paymentId` que mandamos na criação. Amarra o pagamento à nossa linha. */
  ourReference: string | null;
  amountCents: number | null;
  /**
   * Código ISO da moeda em que o valor acima foi cobrado (ex.: `"BRL"`).
   *
   * `amountCents` sozinho não diz em que moeda ele está. Uma resposta que
   * traga o número certo numa moeda errada bate a comparação de centavos e
   * ainda assim entrega uma fração do valor de verdade — o mesmo golpe do
   * centavo que a checagem de valor existe para impedir, só que pela moeda.
   * `null` quando a resposta não trouxe `currency_id` ou trouxe algo que não
   * é string.
   */
  currency: string | null;
}

export interface PaymentProvider {
  readonly name: string;
  /** Falso quando falta credencial: a tela oferece outro caminho em vez de um botão quebrado. */
  readonly available: boolean;

  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;

  /**
   * Consulta o pagamento na API do provedor.
   *
   * EXISTE PORQUE O CORPO DA NOTIFICAÇÃO NÃO É FONTE DE VERDADE. A notificação
   * diz "olhe o pagamento X"; quem diz se X foi aprovado é a API, respondendo a
   * uma pergunta autenticada nossa. Confiar no status que veio no corpo
   * transformaria a assinatura na única barreira — e barreira única é barreira
   * que um dia falha sozinha.
   */
  fetchPayment(ref: string): Promise<PaymentSnapshot>;
}
