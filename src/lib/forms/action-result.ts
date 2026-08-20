import type { AiEnvelope } from '@/types/ai';

/**
 * Retorno das Server Actions que chamam IA.
 *
 * Discriminado por `ok` em vez de lançar exceção: erro de IA é esperado
 * (chave ausente, limite, formato) e a tela precisa mostrá-lo no lugar certo,
 * não derrubar a página inteira no error boundary.
 *
 * Como este arquivo não é `"use server"`, ele pode exportar tipos — o arquivo
 * de ações ao lado só exporta função async, como a diretiva exige.
 */
export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type AiActionResult<T> = ActionResult<AiEnvelope<T>>;

export function ok<T>(value: T): ActionResult<T> {
  return { ok: true, value };
}

export function fail<T>(error: string): ActionResult<T> {
  return { ok: false, error };
}
