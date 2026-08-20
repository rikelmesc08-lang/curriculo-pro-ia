'use client';

import { useCallback, useState, useTransition } from 'react';
import type { AiEnvelope } from '@/types/ai';
import type { AiActionResult } from '@/lib/forms/action-result';

/**
 * Estado de uma chamada de IA na interface.
 *
 * Centraliza o trio carregando/erro/resultado que TODA tela de IA precisa. Sem
 * isso, cada página reimplementa `useState` três vezes e alguma delas esquece
 * de limpar o erro anterior antes de tentar de novo — o bug clássico de "o
 * erro velho fica na tela enquanto o novo resultado chega".
 *
 * `useTransition` em vez de um `loading` manual: mantém a UI responsiva
 * enquanto a Server Action roda e evita o estado preso caso o componente
 * desmonte no meio.
 *
 * `onSuccess` existe para as telas que precisam levar o resultado para outro
 * estado — a carta e a mensagem viram texto editável. Fazer isso num
 * `useEffect` que observa `data` custaria uma renderização extra e um efeito
 * que dispara fora de hora; aqui o callback roda no mesmo passo em que o
 * resultado chega.
 */
export function useAiAction<T, Args extends unknown[]>(
  action: (...args: Args) => Promise<AiActionResult<T>>,
  onSuccess?: (result: AiEnvelope<T>) => void
) {
  const [data, setData] = useState<AiEnvelope<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (...args: Args) => {
      // Limpa o erro ANTES de disparar: manter a mensagem antiga durante a
      // nova tentativa faz o usuário achar que ela já falhou de novo.
      setError(null);
      startTransition(async () => {
        try {
          const result = await action(...args);
          if (result.ok) {
            setData(result.value);
            onSuccess?.(result.value);
          } else {
            setError(result.error);
          }
        } catch {
          // Falha de rede antes de a ação responder (aba offline, servidor
          // caído). A ação em si já converte os próprios erros em `ok: false`.
          setError('Não conseguimos completar a ação. Verifique sua conexão e tente de novo.');
        }
      });
    },
    // `onSuccess` entra nas dependencias: quem passa um callback deve
    // envolve-lo em useCallback, o que mantem `run` estavel entre renders.
    [action, onSuccess]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, error, pending, run, reset };
}
