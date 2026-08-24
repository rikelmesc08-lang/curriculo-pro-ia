import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificação da assinatura das notificações do Mercado Pago.
 *
 * ESTE É O ÚNICO MOTIVO PELO QUAL A URL DO WEBHOOK PODE SER PÚBLICA. Sem esta
 * checagem, qualquer pessoa que descubra o endereço manda um POST dizendo
 * "pagamento tal foi aprovado" e vira `pro` de graça. A URL não é segredo:
 * aparece no painel do provedor, em log de borda, e num histórico de navegador.
 *
 * COMO O MERCADO PAGO ASSINA: o cabeçalho `x-signature` chega como
 * `ts=1700000000,v1=<hex>`. O `v1` é um HMAC-SHA256, com o segredo do webhook,
 * sobre um "manifesto" montado nesta ordem exata:
 *
 *     id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * A ordem, os dois-pontos, os ponto-e-vírgulas e o ponto-e-vírgula FINAL fazem
 * parte do que foi assinado. Qualquer diferença muda o hash inteiro.
 *
 * FICA NUM ARQUIVO SÓ SEU, sem `server-only` e sem tocar em rede nem em banco,
 * porque isto precisa ser testável sem subir nada. É a peça que separa dinheiro
 * de quem paga de dinheiro de quem finge pagar; ela merece teste direto.
 */

export interface AssinaturaRecebida {
  /** Cabeçalho `x-signature` cru. */
  signature: string | null;
  /** Cabeçalho `x-request-id` cru. */
  requestId: string | null;
  /** `data.id` do corpo da notificação. */
  dataId: string | null;
}

export type ResultadoAssinatura =
  | { valida: true }
  | { valida: false; motivo: string };

/** Tolerância de relógio e de reenvio, em segundos. */
const JANELA_SEGUNDOS = 15 * 60;

/** Extrai `ts` e `v1` do cabeçalho, sem supor ordem nem espaçamento. */
function partesDaAssinatura(signature: string): { ts?: string; v1?: string } {
  const partes: { ts?: string; v1?: string } = {};

  for (const pedaco of signature.split(',')) {
    const separador = pedaco.indexOf('=');
    if (separador === -1) continue;

    const chave = pedaco.slice(0, separador).trim();
    const valor = pedaco.slice(separador + 1).trim();

    if (chave === 'ts') partes.ts = valor;
    if (chave === 'v1') partes.v1 = valor;
  }

  return partes;
}

/**
 * Comparação em tempo constante.
 *
 * `===` em string vaza, pelo tempo de resposta, quantos caracteres iniciais
 * bateram — o que permite descobrir a assinatura correta byte a byte. O custo
 * de fazer certo aqui é uma função; o de fazer errado é a chave do cofre.
 */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');

  // `timingSafeEqual` exige o mesmo comprimento. Comparar o tamanho antes não
  // vaza nada útil: o tamanho de um hex de SHA-256 é público e sempre o mesmo.
  if (bufferA.length !== bufferB.length) return false;

  return timingSafeEqual(bufferA, bufferB);
}

export function verificarAssinatura(
  recebida: AssinaturaRecebida,
  segredo: string,
  agoraEmSegundos: number = Math.floor(Date.now() / 1000)
): ResultadoAssinatura {
  if (!segredo) return { valida: false, motivo: 'segredo do webhook não configurado' };
  if (!recebida.signature) return { valida: false, motivo: 'sem cabeçalho x-signature' };
  if (!recebida.dataId) return { valida: false, motivo: 'sem data.id no corpo' };

  const { ts, v1 } = partesDaAssinatura(recebida.signature);
  if (!ts || !v1) return { valida: false, motivo: 'x-signature malformado' };

  const carimbo = Number(ts);
  if (!Number.isFinite(carimbo)) return { valida: false, motivo: 'ts não é número' };

  /**
   * Rejeita notificação velha.
   *
   * Sem isto, uma notificação legítima capturada uma vez vale para sempre:
   * quem a reenviar amanhã continua com assinatura válida. O provedor reassina
   * a cada retentativa, então a janela não derruba reenvio de verdade.
   *
   * A checagem é dos DOIS LADOS. Um `ts` no futuro não é retentativa
   * atrasada — é relógio errado ou tentativa de esticar a validade.
   */
  const distancia = Math.abs(agoraEmSegundos - carimbo);
  if (distancia > JANELA_SEGUNDOS) {
    return { valida: false, motivo: `ts fora da janela (${distancia}s de diferença)` };
  }

  // O provedor documenta que ids alfanuméricos entram em minúsculas no
  // manifesto. Id numérico não é afetado, então normalizar sempre é seguro.
  const id = recebida.dataId.toLowerCase();

  // O `request-id` entra no manifesto quando existe; quando o provedor não o
  // manda, o campo some junto com o rótulo — não vira string vazia.
  const manifesto =
    `id:${id};` +
    (recebida.requestId ? `request-id:${recebida.requestId};` : '') +
    `ts:${ts};`;

  const esperado = createHmac('sha256', segredo).update(manifesto).digest('hex');

  return iguaisEmTempoConstante(esperado, v1.toLowerCase())
    ? { valida: true }
    : { valida: false, motivo: 'assinatura não confere' };
}
