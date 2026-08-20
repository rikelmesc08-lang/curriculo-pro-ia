import type { ZodType } from 'zod';
import type { AiMode } from '@/types/ai';

/**
 * Contrato do provedor de IA.
 *
 * POR QUE UMA "TAREFA" E NÃO UM `complete(prompt): string`
 * --------------------------------------------------------
 * Um provedor genérico de texto obrigaria o modo demonstração a fingir que é
 * um modelo de linguagem — e ele não é. Aqui cada tarefa carrega as DUAS
 * implementações: o prompt para o modelo real e uma função `demo()`
 * determinística que só reorganiza o que o próprio usuário digitou.
 *
 * Consequência que importa para o produto: sem chave de API o app continua
 * inteiramente navegável, e cada resultado vem carimbado como demonstração.
 * Em nenhum momento uma resposta pré-programada é apresentada como se fosse a
 * IA real — ver `AiEnvelope.mode` e o componente `AiModeBadge`.
 */
export interface AiTask<T> {
  /** Nome curto, usado em log e mensagem de erro. */
  name: string;
  system: string;
  prompt: string;
  /** Valida a saída do modelo. Texto que não passa aqui não chega à UI. */
  schema: ZodType<T>;
  maxTokens: number;
  /**
   * Resultado do modo demonstração.
   *
   * REGRA: pode reorganizar, cortar e rotular o que o usuário forneceu.
   * Não pode inventar empresa, cargo, curso, número ou competência.
   */
  demo: () => T;
}

export interface AiProvider {
  id: 'anthropic' | 'demo';
  mode: AiMode;
  run<T>(task: AiTask<T>): Promise<T>;
}

/** Erro de IA que a UI sabe exibir. Nunca vaza corpo de resposta cru para a tela. */
export class AiError extends Error {
  readonly task: string;
  readonly kind: 'configuracao' | 'rede' | 'formato' | 'limite';

  constructor(kind: AiError['kind'], task: string, message: string) {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
    this.task = task;
  }

  /** Mensagem escrita para o usuário final, não para o log. */
  get userMessage(): string {
    switch (this.kind) {
      case 'configuracao':
        return 'A IA não está configurada neste ambiente. Confira a chave de API nas variáveis de ambiente.';
      case 'limite':
        return 'A IA atingiu o limite de uso no momento. Tente de novo em alguns minutos.';
      case 'formato':
        return 'A IA respondeu num formato inesperado. Tente de novo — se persistir, reduza o tamanho do texto enviado.';
      case 'rede':
      default:
        return 'Não conseguimos falar com a IA agora. Verifique sua conexão e tente de novo.';
    }
  }
}
