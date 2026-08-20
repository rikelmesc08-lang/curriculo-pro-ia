/**
 * Formato único de retorno de Server Action usada em formulário.
 *
 * Este arquivo NÃO é `"use server"` de propósito: um módulo com essa diretiva
 * só pode exportar função async, e tipos/constantes exportados dali quebram o
 * build (ou pior, passam em `tsc` e falham só no clique real). Tipo mora aqui;
 * a ação, no arquivo `actions.ts` ao lado.
 */

export interface FormState {
  status: 'idle' | 'success' | 'error';
  /** Mensagem geral, exibida no topo do formulário. */
  message?: string;
  /** Erro por campo, exibido embaixo do input correspondente. */
  fieldErrors?: Record<string, string>;
}

export const idleFormState: FormState = { status: 'idle' };

export function formError(message: string, fieldErrors?: Record<string, string>): FormState {
  return { status: 'error', message, fieldErrors };
}

export function formSuccess(message?: string): FormState {
  return { status: 'success', message };
}

/** Lê um campo de texto do FormData já aparado. Nunca devolve `undefined`. */
export function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** Lê um checkbox: presente e diferente de "false" significa marcado. */
export function checkbox(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value !== null && value !== 'false';
}
