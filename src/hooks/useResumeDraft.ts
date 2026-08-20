'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { saveResumeAction } from '@/server/actions/resume';
import type { ResumeContent } from '@/types/resume';

/**
 * Rascunho do currículo com salvamento automático.
 *
 * DECISÕES QUE IMPORTAM AQUI
 * --------------------------
 * 1. O estado é do cliente e a gravação é debounced. Salvar a cada tecla
 *    mandaria dezenas de requisições por campo; salvar só num botão "Salvar"
 *    perderia o trabalho de quem fecha a aba — e um formulário de currículo é
 *    longo o bastante para isso doer de verdade.
 *
 * 2. O que já foi gravado fica em ESTADO (`savedSnapshot`), não em ref. É ele
 *    que responde "há alteração pendente?", pergunta feita durante o render —
 *    e ref não pode ser lida no render sem quebrar a garantia de que a tela
 *    reflete o estado atual.
 *
 * 3. Erro de gravação NÃO limpa a tela nem reverte o texto. O conteúdo
 *    digitado continua onde está e o estado vira `erro`, com o aviso visível.
 *    Perder o que a pessoa escreveu por causa de uma falha de rede seria o
 *    pior desfecho possível neste produto.
 */

export type SaveStatus = 'ocioso' | 'salvando' | 'salvo' | 'erro';

const AUTOSAVE_DELAY_MS = 1200;

export function useResumeDraft(initial: { id: string | null; content: ResumeContent }) {
  const [resumeId, setResumeId] = useState<string | null>(initial.id);
  const [content, setContent] = useState<ResumeContent>(initial.content);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initial.content));
  const [status, setStatus] = useState<SaveStatus>('ocioso');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((updater: (previous: ResumeContent) => ResumeContent) => {
    setContent(updater);
  }, []);

  /** Grava agora, sem esperar o debounce. Usado ao trocar de etapa. */
  const saveNow = useCallback(
    async (candidate?: ResumeContent) => {
      const payload = candidate ?? content;
      const serialized = JSON.stringify(payload);
      if (serialized === savedSnapshot) return;

      setStatus('salvando');
      setError(null);

      const result = await saveResumeAction(resumeId, payload);
      if (result.ok) {
        setSavedSnapshot(serialized);
        setResumeId(result.value.id);
        setSavedAt(result.value.updatedAt);
        setStatus('salvo');
      } else {
        setStatus('erro');
        setError(result.error);
      }
    },
    [content, resumeId, savedSnapshot]
  );

  const hasUnsavedChanges = JSON.stringify(content) !== savedSnapshot;

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void saveNow(content);
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [content, hasUnsavedChanges, saveNow]);

  /**
   * Avisa antes de fechar a aba com alteração pendente.
   *
   * O navegador mostra o texto padrão dele — não dá para personalizar, e é
   * assim de propósito, para páginas não inventarem mensagens alarmantes.
   */
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function handler(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  return { resumeId, content, update, status, error, savedAt, saveNow, hasUnsavedChanges };
}
