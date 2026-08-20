'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Descrição da vaga compartilhada entre as ferramentas.
 *
 * Cinco telas trabalham sobre a mesma vaga — analisar, otimizar, carta,
 * entrevista, mensagem. Sem isto, a pessoa cola o mesmo texto cinco vezes, e na
 * terceira desiste.
 *
 * `sessionStorage`, não `localStorage`: a vaga interessa enquanto a aba está
 * aberta. Deixar um anúncio de emprego guardado no navegador por tempo
 * indeterminado, num computador que pode ser compartilhado, é um vazamento
 * pequeno e evitável.
 *
 * POR QUE `useSyncExternalStore` E NÃO `useState` + `useEffect`: o
 * `sessionStorage` é um sistema externo ao React, e ler dele dentro de um
 * efeito para depois chamar `setState` provoca uma renderização em cascata a
 * cada montagem — além de ser exatamente o que a regra `set-state-in-effect`
 * existe para evitar. Com este hook, o React lê o valor na hora certa, o
 * servidor renderiza vazio sem divergência de hidratação, e as telas abertas
 * em paralelo enxergam a mesma vaga.
 */

const STORAGE_KEY = 'cpro:vaga';

/**
 * Valor corrente em memória — é ele a fonte da verdade durante a sessão.
 *
 * O `sessionStorage` entra só como persistência entre navegações. Se o
 * navegador bloquear o armazenamento, a leitura falha, o valor em memória
 * segue valendo e as ferramentas continuam compartilhando a vaga na mesma
 * navegação. O caminho oposto — ler o storage a cada chamada — perderia o
 * texto silenciosamente nesse cenário.
 */
let snapshot = '';
let hydrated = false;
const listeners = new Set<() => void>();

function readStorage(): string {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    // Navegador com armazenamento bloqueado. As ferramentas continuam
    // funcionando; só não lembram o texto entre as telas.
    return '';
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string {
  // A leitura do storage acontece uma única vez, no primeiro render do
  // cliente. `useSyncExternalStore` chama `getSnapshot` a cada render e entra
  // em laço se o valor devolvido mudar sem que nada tenha mudado de fato.
  if (!hydrated) {
    hydrated = true;
    snapshot = readStorage();
  }
  return snapshot;
}

/** No servidor não existe `sessionStorage`: a vaga começa vazia. */
function getServerSnapshot(): string {
  return '';
}

export function useJobDescription() {
  const jobDescription = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setJobDescription = useCallback((value: string) => {
    try {
      if (value) window.sessionStorage.setItem(STORAGE_KEY, value);
      else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // idem: sem armazenamento, o valor vive só nesta tela.
    }
    snapshot = value;
    for (const listener of listeners) listener();
  }, []);

  return { jobDescription, setJobDescription };
}
