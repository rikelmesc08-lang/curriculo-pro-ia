'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Consulta de media query para a lógica de JavaScript.
 *
 * POR QUE `useSyncExternalStore` E NÃO `useEffect` + `setState`: a versão do
 * 21st.dev descobre o celular com um `useEffect` que chama `setState` na
 * montagem. Isso quebra a regra `react-hooks/set-state-in-effect` que este
 * projeto tem ligada, e provoca um render a mais em toda montagem — o card
 * aparece com a escala errada por um quadro antes de corrigir.
 *
 * `matchMedia` é exatamente o "sistema externo" que este hook do React existe
 * para ler. O servidor recebe o `serverSnapshot`, então não há divergência de
 * hidratação.
 */
function useMediaQuery(query: string, serverSnapshot: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const lista = window.matchMedia(query);
      lista.addEventListener('change', onChange);
      return () => lista.removeEventListener('change', onChange);
    },
    [query]
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}

/**
 * Respeita a preferência de sistema por menos movimento.
 *
 * Não é detalhe de acessibilidade opcional: animação de rotação em bloco
 * grande dispara enjoo em quem tem sensibilidade vestibular. Quem pediu menos
 * movimento recebe o card parado, sem perder nenhuma informação.
 *
 * O padrão do servidor é `false` (com movimento) porque é o caso da grande
 * maioria; quem tem a preferência ligada recebe a correção na hidratação,
 * antes de qualquer rolagem acontecer.
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)', false);
}

/**
 * Telas estreitas. O corte em 768px acompanha o `md` do Tailwind, para o
 * JavaScript e o CSS concordarem sobre o que é celular.
 *
 * O padrão do servidor é `false`: o HTML sai com as medidas de desktop e o
 * CSS responsivo já cuida do layout: só a intensidade da animação depende
 * deste valor.
 */
export function useIsCompactScreen(): boolean {
  return useMediaQuery('(max-width: 768px)', false);
}
