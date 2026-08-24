'use client';

import { useState, useTransition } from 'react';
import { iniciarCheckoutAction } from '@/server/actions/payment';
import { track } from '@/lib/analytics/track';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';

/**
 * Manda a pessoa para o checkout do Mercado Pago.
 *
 * O DESTINO É DECIDIDO NO SERVIDOR, e o botão só obedece. A URL do pedido é
 * criada pela Server Action, com o preço lido do ambiente do servidor — nada de
 * valor vindo do formulário. Preço que trafega pelo cliente é preço que o
 * cliente edita.
 *
 * `window.location.assign` e não `router.push`: o destino é outro domínio, e a
 * navegação do Next só entende rotas nossas.
 */
export function CheckoutButton({ priceLabel }: { priceLabel: string }) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function pagar() {
    setErro(null);
    track('checkout_started', {});

    startTransition(async () => {
      const resultado = await iniciarCheckoutAction();

      if (!resultado.ok) {
        setErro(resultado.error);
        return;
      }

      window.location.assign(resultado.value.url);
    });
  }

  return (
    <div>
      <Button
        type="button"
        onClick={pagar}
        loading={pending}
        loadingLabel="Abrindo o pagamento..."
        size="lg"
        block
        className="uppercase tracking-wide"
      >
        Pagar {priceLabel}
      </Button>

      <p className="mt-2 text-center text-xs text-muted">
        Pagamento único, sem assinatura. PIX, cartão ou boleto pelo Mercado Pago.
      </p>

      {erro && (
        <Alert tone="danger" className="mt-3">
          {erro}
        </Alert>
      )}
    </div>
  );
}
