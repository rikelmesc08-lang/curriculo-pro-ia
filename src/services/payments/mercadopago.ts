import 'server-only';

import { env } from '@/lib/env';
import { PaymentError, type CheckoutInput, type CheckoutSession, type PaymentProvider, type PaymentSnapshot } from './provider';
import { traduzirStatus } from './mercadopago-status';

/**
 * Adaptador do Mercado Pago (Checkout Pro).
 *
 * POR QUE CHECKOUT HOSPEDADO: a pessoa digita o cartão no domínio do Mercado
 * Pago, não no nosso. Nenhum dado de cartão passa por este servidor, em
 * nenhum momento — o que nos tira de cima as exigências de quem guarda esse
 * dado, e garante que um defeito nosso não pode vazar um número que nunca
 * esteve aqui.
 *
 * PIX VEM JUNTO, e é o que mais importa para este produto: boa parte de quem
 * está procurando emprego não tem cartão de crédito com limite livre. O
 * Checkout Pro oferece PIX, cartão e boleto sem trabalho adicional nosso.
 *
 * Sem `MERCADOPAGO_ACCESS_TOKEN` o provedor se declara INDISPONÍVEL e a tela
 * mostra outro caminho — nunca um botão que falha depois do clique.
 */

const API = 'https://api.mercadopago.com';

/** Teto de espera por chamada. Sem isto, a tela fica pendurada num provedor lento. */
const TIMEOUT_MS = 15_000;

function token(): string | undefined {
  return env.mercadoPagoAccessToken();
}

async function chamar(caminho: string, init: RequestInit): Promise<unknown> {
  const chave = token();
  if (!chave) {
    throw new PaymentError(
      'configuracao',
      'MERCADOPAGO_ACCESS_TOKEN ausente',
      'O pagamento não está disponível agora.'
    );
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${API}${caminho}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${chave}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (erro) {
    throw new PaymentError(
      'provedor',
      `falha de rede ao chamar ${caminho}: ${String(erro)}`,
      'Não conseguimos falar com o sistema de pagamento. Tente de novo em instantes.'
    );
  }

  if (!resposta.ok) {
    // O corpo do erro pode conter dado da conta. Vai para o log do servidor,
    // recortado, e nunca para a tela.
    const detalhe = await resposta.text().catch(() => '');
    throw new PaymentError(
      'provedor',
      `${caminho} respondeu ${resposta.status}: ${detalhe.slice(0, 500)}`,
      resposta.status >= 500
        ? 'O sistema de pagamento está instável. Tente de novo em instantes.'
        : 'Não conseguimos iniciar o pagamento agora. Se continuar, fale com a gente.'
    );
  }

  try {
    return await resposta.json();
  } catch {
    throw new PaymentError('resposta', `${caminho} não devolveu JSON`, 'Resposta inesperada do sistema de pagamento.');
  }
}

/** Lê um campo string de um objeto desconhecido, sem confiar na forma. */
function texto(objeto: unknown, campo: string): string | null {
  if (!objeto || typeof objeto !== 'object') return null;
  const valor = (objeto as Record<string, unknown>)[campo];
  return typeof valor === 'string' && valor.length > 0 ? valor : null;
}

export const mercadoPagoProvider: PaymentProvider = {
  name: 'mercadopago',

  get available() {
    return Boolean(token());
  },

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const corpo = {
      items: [
        {
          id: input.paymentId,
          title: input.title,
          quantity: 1,
          currency_id: 'BRL',
          // A API fala em reais decimais; nós guardamos centavos inteiros. A
          // conversão acontece SÓ aqui, na borda, e volta a ser inteiro na
          // resposta. Dinheiro não circula como float dentro do produto.
          unit_price: input.amountCents / 100,
        },
      ],
      /**
       * A AMARRA ENTRE O PAGAMENTO DELES E A NOSSA LINHA.
       *
       * Volta em toda notificação. Sem isto, saber quem pagou dependeria de
       * casar valor e horário — que é adivinhação, e erra quando duas pessoas
       * compram no mesmo minuto.
       */
      external_reference: input.paymentId,
      back_urls: {
        success: input.returnUrl,
        pending: input.returnUrl,
        failure: input.returnUrl,
      },
      auto_return: 'approved',
      notification_url: input.notificationUrl,
      ...(input.payerEmail ? { payer: { email: input.payerEmail } } : {}),
      /**
       * Sem parcelamento e sem saldo em conta do Mercado Pago? Não: deixamos o
       * padrão. Restringir meio de pagamento aqui é decisão comercial, e a
       * padrão do Checkout Pro já inclui PIX, que é o que este público usa.
       */
    };

    const resposta = await chamar('/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify(corpo),
    });

    const ref = texto(resposta, 'id');
    const url = texto(resposta, 'init_point') ?? texto(resposta, 'sandbox_init_point');

    if (!ref || !url) {
      throw new PaymentError(
        'resposta',
        `preferência sem id ou init_point: ${JSON.stringify(resposta).slice(0, 300)}`,
        'Não conseguimos abrir a tela de pagamento. Tente de novo em instantes.'
      );
    }

    return { ref, url };
  },

  async fetchPayment(ref: string): Promise<PaymentSnapshot> {
    const resposta = await chamar(`/v1/payments/${encodeURIComponent(ref)}`, { method: 'GET' });

    const bruto = resposta as Record<string, unknown> | null;
    const valor = bruto?.transaction_amount;

    return {
      ref,
      status: traduzirStatus(bruto?.status),
      ourReference: texto(resposta, 'external_reference'),
      // De volta para centavos inteiros, com arredondamento explícito: o valor
      // chega como decimal e 27.9 * 100 dá 2789.9999... em ponto flutuante.
      amountCents: typeof valor === 'number' ? Math.round(valor * 100) : null,
    };
  },
};
