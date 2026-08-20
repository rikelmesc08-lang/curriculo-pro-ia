import 'server-only';

import { env } from '@/lib/env';
import type { AiEnvelope } from '@/types/ai';
import { anthropicProvider } from './anthropic';
import { demoProvider } from './demo';
import { AiError, type AiProvider, type AiTask } from './provider';

export { AiError } from './provider';
export type { AiProvider, AiTask } from './provider';

const DEMO_NOTICE =
  'Modo demonstração: nenhuma IA foi chamada. O resultado abaixo foi montado a partir do que você mesmo digitou, para você conhecer o fluxo. Configure ANTHROPIC_API_KEY para usar a IA de verdade.';

/** Qual provedor está ativo agora. A UI usa isto para avisar antes do clique. */
export function getAiProvider(): AiProvider {
  return env.aiProvider() === 'anthropic' ? anthropicProvider : demoProvider;
}

export function aiModeIsDemo(): boolean {
  return getAiProvider().mode === 'demo';
}

/**
 * Executa uma tarefa e devolve o resultado junto do modo em que foi produzido.
 *
 * NÃO existe fallback silencioso: se o provedor real falhar, o erro sobe. Cair
 * para o modo demonstração sem avisar entregaria um texto pré-programado com
 * cara de resposta da IA — exatamente o que este produto não pode fazer.
 */
export async function runAiTask<T>(task: AiTask<T>): Promise<AiEnvelope<T>> {
  const provider = getAiProvider();
  const data = await provider.run(task);
  return {
    mode: provider.mode,
    data,
    notice: provider.mode === 'demo' ? DEMO_NOTICE : undefined,
  };
}

/** Converte qualquer erro em mensagem exibível, sem vazar detalhe interno. */
export function aiErrorMessage(error: unknown): string {
  if (error instanceof AiError) return error.userMessage;
  return 'Algo deu errado ao gerar o conteúdo. Tente de novo.';
}
