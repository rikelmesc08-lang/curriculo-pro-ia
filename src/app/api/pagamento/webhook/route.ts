import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { buscarPagamento, definirPlano, liquidarPagamento } from '@/lib/db/payments';
import { getPaymentProvider } from '@/services/payments';
import { verificarAssinatura } from '@/services/payments/mercadopago-signature';

/**
 * Notificações do Mercado Pago.
 *
 * ESTA ROTA É PÚBLICA E NÃO TEM SESSÃO. Quem chama é o provedor, não uma
 * pessoa logada — então tudo que a protege está escrito aqui dentro. A URL não
 * é segredo: aparece no painel do provedor, em log de borda e em histórico de
 * navegador.
 *
 * A ORDEM DAS CHECAGENS É A PRÓPRIA SEGURANÇA:
 *
 *   1. assinatura confere? (se não, nada mais acontece)
 *   2. é notificação de pagamento? (o resto é ignorado, com 200)
 *   3. o que o PROVEDOR diz, perguntando à API dele — nunca o que veio no corpo
 *   4. o pagamento aponta para uma linha nossa?
 *   5. o valor pago cobre o que cobramos?
 *   6. a transição de status é permitida?
 *
 * SÓ DEPOIS DISSO alguém vira `pro`.
 *
 * SOBRE OS CÓDIGOS DE RESPOSTA: 200 significa "processado, não reenvie". 500
 * significa "falhei, reenvie". Devolver 200 num erro nosso faz o provedor
 * desistir e a compra some; devolver 500 numa notificação que já foi tratada
 * faz o provedor reenviar para sempre. Assinatura inválida devolve 401 e não
 * pede reenvio.
 */

export const runtime = 'nodejs';
export const maxDuration = 30;

/** Corpo maior que isto não é notificação de pagamento. */
const MAX_CORPO_BYTES = 64 * 1024;

/** Lê `data.id` sem confiar na forma do corpo. */
function extrairDataId(corpo: unknown): string | null {
  if (!corpo || typeof corpo !== 'object') return null;
  const data = (corpo as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return null;
  const id = (data as Record<string, unknown>).id;
  if (typeof id === 'string' && id.length > 0) return id;
  if (typeof id === 'number') return String(id);
  return null;
}

function extrairTipo(corpo: unknown): string {
  if (!corpo || typeof corpo !== 'object') return '';
  const registro = corpo as Record<string, unknown>;
  const tipo = registro.type ?? registro.topic;
  return typeof tipo === 'string' ? tipo : '';
}

export async function POST(request: Request) {
  const segredo = env.mercadoPagoWebhookSecret();

  /**
   * Sem segredo configurado, NADA é processado.
   *
   * A tentação aqui é "deixa passar enquanto não configuram". Isso transformaria
   * a rota num botão público de virar `pro`. Recusar é a única resposta
   * possível — e o log diz por quê, para quem for investigar.
   */
  if (!segredo) {
    console.error('[webhook] MERCADOPAGO_WEBHOOK_SECRET ausente: notificação recusada');
    return NextResponse.json({ erro: 'webhook não configurado' }, { status: 503 });
  }

  let texto: string;
  try {
    texto = await request.text();
    if (texto.length > MAX_CORPO_BYTES) {
      return NextResponse.json({ erro: 'corpo grande demais' }, { status: 413 });
    }
  } catch {
    return NextResponse.json({ erro: 'corpo ilegível' }, { status: 400 });
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return NextResponse.json({ erro: 'corpo inválido' }, { status: 400 });
  }

  const dataId = extrairDataId(corpo);

  // 1. Assinatura. Antes de tudo, e sem exceção.
  const assinatura = verificarAssinatura(
    {
      signature: request.headers.get('x-signature'),
      requestId: request.headers.get('x-request-id'),
      dataId,
    },
    segredo
  );

  if (!assinatura.valida) {
    console.error(`[webhook] assinatura recusada: ${assinatura.motivo}`);
    return NextResponse.json({ erro: 'assinatura inválida' }, { status: 401 });
  }

  // 2. O provedor manda notificação de vários assuntos. Só pagamento interessa.
  const tipo = extrairTipo(corpo);
  if (tipo !== 'payment' || !dataId) {
    return NextResponse.json({ ok: true, ignorado: tipo || 'sem tipo' });
  }

  try {
    // 3. A VERDADE VEM DA API, não do corpo. O corpo diz "olhe o pagamento X";
    //    quem diz se X foi aprovado é uma resposta autenticada do provedor.
    const snapshot = await getPaymentProvider().fetchPayment(dataId);

    // 4. O pagamento precisa apontar para uma linha nossa.
    if (!snapshot.ourReference) {
      console.error(`[webhook] pagamento ${dataId} sem external_reference`);
      return NextResponse.json({ ok: true, ignorado: 'sem referência' });
    }

    const pagamento = await buscarPagamento(snapshot.ourReference);
    if (!pagamento) {
      console.error(`[webhook] referência desconhecida: ${snapshot.ourReference}`);
      return NextResponse.json({ ok: true, ignorado: 'referência desconhecida' });
    }

    /**
     * 5. O valor pago cobre o que cobramos?
     *
     * O preço vai para o provedor na criação do pedido, e o pedido é criado
     * pelo nosso servidor — mas conferir na volta custa uma comparação e fecha
     * a classe inteira de ataque em que alguém paga um centavo por um produto
     * de R$ 27,90. Nunca confie na volta só porque você controlou a ida.
     */
    if (snapshot.status === 'pago' && snapshot.amountCents !== null) {
      if (snapshot.amountCents < pagamento.amountCents) {
        console.error(
          `[webhook] valor insuficiente em ${dataId}: pago ${snapshot.amountCents}, esperado ${pagamento.amountCents}`
        );
        return NextResponse.json({ ok: true, ignorado: 'valor insuficiente' });
      }
    }

    // 6. Transição permitida? Notificação atrasada não rebaixa compra paga.
    const resultado = await liquidarPagamento({
      paymentId: pagamento.id,
      paymentRef: snapshot.ref,
      status: snapshot.status,
    });

    if (resultado.desfecho !== 'atualizado') {
      // Reentrega da mesma notificação, ou uma fora de ordem. Nada a fazer, e
      // 200 para o provedor parar de reenviar.
      return NextResponse.json({ ok: true, ignorado: 'sem mudança' });
    }

    /**
     * O ACESSO SEGUE O DINHEIRO, NOS DOIS SENTIDOS.
     *
     * Estorno e chargeback devolvem a pessoa ao plano gratuito. Deixar `pro`
     * depois de o dinheiro voltar seria dar o produto de graça a quem pediu o
     * dinheiro de volta — e é o caminho preferido de quem faz isso de propósito.
     */
    if (resultado.pagamento.status === 'pago') {
      await definirPlano(pagamento.ownerId, 'pro');
    } else if (resultado.pagamento.status === 'estornado') {
      await definirPlano(pagamento.ownerId, 'gratuito');
    }

    return NextResponse.json({ ok: true, status: resultado.pagamento.status });
  } catch (erro) {
    /**
     * 500 DE PROPÓSITO: o provedor reenvia.
     *
     * Aqui caem falhas nossas — API fora do ar, banco indisponível. Responder
     * 200 faria o provedor considerar entregue, e a compra de alguém que pagou
     * ficaria pendente para sempre, sem nenhum evento futuro para corrigi-la.
     */
    console.error('[webhook]', erro);
    return NextResponse.json({ erro: 'falha ao processar' }, { status: 500 });
  }
}
