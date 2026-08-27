import { z } from 'zod';

/**
 * Validação de credenciais, compartilhada entre cadastro e login.
 *
 * As mensagens são as que o usuário lê — por isso estão em português e dizem
 * o que fazer, não o que a regra se chama.
 */

export const emailSchema = z
  .string()
  .min(1, 'Informe seu e-mail.')
  .email('E-mail inválido. Confira se não faltou o @ ou o domínio.');

/**
 * Oito caracteres é o piso; não exigimos símbolo obrigatório.
 *
 * Regra de composição rígida empurra a pessoa para `Senha@123` e para o
 * papelzinho colado no monitor. Comprimento é o que de fato custa caro para
 * quem tenta adivinhar.
 */
export const passwordSchema = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
  .max(200, 'A senha é longa demais.');

/**
 * Senha ATUAL, na troca de senha.
 *
 * Só exige "não vazio" — não é a senha sendo definida, é a que já existe e
 * precisa ser confirmada antes da troca. Regra de formato (tamanho mínimo)
 * não se aplica a uma senha que já foi aceita no passado.
 */
export const currentPasswordSchema = z.string().min(1, 'Informe sua senha atual.');

export const nameSchema = z
  .string()
  .min(2, 'Informe seu nome.')
  .max(120, 'Nome longo demais.');

export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe sua senha.'),
});

/** Converte erro do Zod no mapa `campo -> primeira mensagem` que a UI espera. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

/** E-mail normalizado para busca: minúsculas e sem espaço nas pontas. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
