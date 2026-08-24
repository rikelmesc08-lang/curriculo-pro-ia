import type { Payment } from '@/types/payment';
import { Alert } from '@/components/ui/Feedback';

/**
 * Aviso sobre o resultado da tentativa de pagamento mais recente.
 *
 * A FONTE DA VERDADE É O NOSSO BANCO, NUNCA A URL DE RETORNO. O Mercado Pago
 * pode mandar a pessoa de volta dizendo "aprovado" no parâmetro da URL, mas
 * quem confirma de fato é o webhook, escrevendo o status na nossa tabela —
 * que pode levar alguns segundos (cartão) ou minutos (PIX, boleto) para
 * chegar. Por isso este componente decide tudo a partir de `ultimaTentativa`
 * e `jaEhPro`, que vêm do banco, e ignora qualquer coisa que a URL diga.
 *
 * Cobre três desfechos possíveis para quem ainda não é Pro:
 *   - `pendente` (ou tentativa recém-criada): ainda confirmando.
 *   - `recusado`: o provedor recusou — mostrado mesmo fora do retorno direto,
 *     porque é a situação mais acionável (a pessoa pode querer tentar de novo
 *     com outro método) e não deveria desaparecer só porque ela navegou.
 *   - `cancelado`: a pessoa saiu do checkout por conta própria — mostrado só
 *     no retorno imediato, para não virar um aviso permanente sobre uma
 *     escolha que já passou.
 *
 * Quando `jaEhPro` é verdadeiro, não há nada a avisar aqui: o card "Já é seu"
 * ao lado, na página de upgrade, já cobre a confirmação.
 */
export function PaymentStatusBanner({
  retornouDoCheckout,
  jaEhPro,
  ultimaTentativa,
}: {
  retornouDoCheckout: boolean;
  jaEhPro: boolean;
  ultimaTentativa: Payment | undefined;
}) {
  if (jaEhPro) return null;
  if (!retornouDoCheckout && ultimaTentativa?.status !== 'recusado') return null;

  const dataFormatada = ultimaTentativa
    ? new Date(ultimaTentativa.createdAt).toLocaleString('pt-BR')
    : null;

  if (ultimaTentativa?.status === 'recusado') {
    return (
      <Alert tone="danger" title="Pagamento não aprovado" className="mb-5">
        <p>
          O Mercado Pago recusou esta tentativa — nenhum valor foi cobrado. Isso costuma acontecer
          por dados do cartão, limite disponível ou verificação de segurança. Você pode tentar de
          novo, inclusive com outro método, como PIX.
        </p>
        {dataFormatada && <p className="mt-2 text-xs">Tentativa em {dataFormatada}.</p>}
      </Alert>
    );
  }

  if (ultimaTentativa?.status === 'cancelado') {
    return (
      <Alert tone="neutral" title="Pagamento não concluído" className="mb-5">
        <p>
          Você saiu do checkout antes de terminar. Nenhum valor foi cobrado. Quando quiser, é só
          tentar de novo.
        </p>
      </Alert>
    );
  }

  return (
    <Alert tone="info" title="Estamos confirmando seu pagamento" className="mb-5">
      <p>
        Se você concluiu o pagamento, a liberação acontece assim que o Mercado Pago confirmar —
        costuma levar alguns segundos no cartão e um pouco mais no PIX e no boleto. Você não
        precisa pagar de novo. Atualize esta página em instantes.
      </p>
      {ultimaTentativa && dataFormatada && (
        <p className="mt-2 text-xs text-muted">
          Última tentativa registrada: {ultimaTentativa.status}, em {dataFormatada}.
        </p>
      )}
    </Alert>
  );
}
