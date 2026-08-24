'use client';

import { useEffect, useState } from 'react';
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
 *
 * ESTADO DE CARREGAMENTO É `useState`, NÃO `useTransition`, de propósito: o
 * clique dispara uma navegação para outro domínio, e a pessoa pode apertar
 * "voltar" no Mercado Pago antes de pagar. Alguns navegadores restauram a
 * página pelo bfcache nesse retorno — congelada no exato instante em que ela
 * saiu, `pending: true` incluso, porque o clique tinha acabado de acontecer.
 * `useTransition` não tem um jeito de resetar seu `pending` de fora; um
 * `useState` comum tem, e é o que o `pageshow` abaixo usa para destravar o
 * botão. Sem isso, ele ficaria preso em "Abrindo o pagamento..." para sempre,
 * e a única saída seria a pessoa descobrir sozinha que precisa recarregar.
 */
export function CheckoutButton({ priceLabel }: { priceLabel: string }) {
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    // `event.persisted` só é verdadeiro quando a página voltou do bfcache —
    // nunca num carregamento novo. É o sinal certo para destravar, e só ele.
    // Uma nova tentativa depois disso é legítima e segura: o freio de
    // 10 por hora mora no servidor (`iniciarCheckoutAction`), e cada
    // tentativa cria uma linha rastreável, então tentar de novo não duplica
    // cobrança nem foge do controle.
    function aoRestaurarDoCache(event: PageTransitionEvent) {
      if (event.persisted) {
        setPending(false);
        setErro(null);
      }
    }

    window.addEventListener('pageshow', aoRestaurarDoCache);
    return () => window.removeEventListener('pageshow', aoRestaurarDoCache);
  }, []);

  async function pagar() {
    setErro(null);
    setPending(true);
    track('checkout_started', {});

    /**
     * O `try/catch` AQUI NÃO É REDUNDANTE COM `resultado.ok`.
     *
     * `resultado.ok === false` cobre o erro que a Server Action TRATOU e
     * devolveu como valor. Isso não cobre a Server Action LANÇAR — uma falha
     * transitória de rede ou de banco no meio do caminho vira uma promise
     * rejeitada, não um `ActionResult`. Sem capturar isso aqui, `setPending`
     * nunca volta a `false`: o botão trava em "Abrindo o pagamento..." para
     * sempre, sem mensagem nenhuma na tela, e sem navegação para o
     * `pageshow` de bfcache destravar depois — porque não houve navegação
     * nenhuma, a página nunca saiu.
     */
    try {
      const resultado = await iniciarCheckoutAction();

      if (!resultado.ok) {
        setErro(resultado.error);
        setPending(false);
        return;
      }

      // Sem resetar `pending` aqui: a navegação para o Mercado Pago já está a
      // caminho, e o botão deve continuar "carregando" até a troca de página
      // — ou até o `pageshow` acima destravar, se a pessoa voltar sem pagar.
      window.location.assign(resultado.value.url);
    } catch {
      setErro('Não conseguimos iniciar o pagamento agora. Tente de novo em instantes.');
      setPending(false);
    }
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
        className="!whitespace-normal text-center uppercase tracking-wide"
        aria-label={`Desbloquear meu currículo completo por ${priceLabel}, pagamento único`}
      >
        Desbloquear meu currículo completo
      </Button>

      <p className="mt-2 text-center text-xs text-muted">
        {priceLabel}, pagamento único, sem assinatura. PIX, cartão ou boleto pelo Mercado Pago.
      </p>

      <div aria-live="polite">
        {erro && (
          <Alert tone="danger" className="mt-3">
            {erro}
          </Alert>
        )}
      </div>
    </div>
  );
}
