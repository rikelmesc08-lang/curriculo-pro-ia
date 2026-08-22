import 'server-only';

import { env } from '@/lib/env';
import type { AiEnvelope } from '@/types/ai';
import { anthropicProvider } from './anthropic';
import { demoProvider } from './demo';
import { geminiProvider } from './gemini';
import { AiError, type AiProvider, type AiTask } from './provider';

export { AiError } from './provider';
export type { AiProvider, AiTask } from './provider';

const DEMO_NOTICE =
  'Modo demonstração: nenhuma IA foi chamada. O resultado abaixo foi montado a partir do que você mesmo digitou, para você conhecer o fluxo. Configure GEMINI_API_KEY para usar a IA de verdade — a camada gratuita do Google já basta.';

const PROVIDERS: Record<string, AiProvider> = {
  gemini: geminiProvider,
  anthropic: anthropicProvider,
  demo: demoProvider,
};

/**
 * Qual provedor está ativo agora. A UI usa isto para avisar antes do clique.
 *
 * O mapa acima é o ÚNICO lugar do projeto que sabe quais provedores existem.
 * Acrescentar OpenAI, Mistral ou qualquer outro é escrever um arquivo que
 * implemente `AiProvider` e somar uma linha aqui — nenhuma tela, Server Action
 * ou prompt muda, porque nada fora desta pasta conhece provedor nenhum.
 */
export function getAiProvider(): AiProvider {
  return PROVIDERS[env.aiProvider()] ?? demoProvider;
}

export function aiModeIsDemo(): boolean {
  return getAiProvider().mode === 'demo';
}

/**
 * Nome do provedor ativo, para a interface escrever quem recebe os dados.
 *
 * A política de privacidade PRECISA disto: ela descreve o sistema real, e dizer
 * "Anthropic" quando o que está configurado é o Google seria descrever um
 * sistema imaginário — o defeito que aquela página existe para não ter.
 */
export function aiProviderLabel(): string {
  switch (getAiProvider().id) {
    case 'gemini':
      return 'API Gemini, do Google';
    case 'anthropic':
      return 'API da Anthropic';
    default:
      return 'nenhum provedor externo';
  }
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
