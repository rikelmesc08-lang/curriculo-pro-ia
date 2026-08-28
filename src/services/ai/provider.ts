import type { ZodType } from 'zod';
import type { TipoAceito } from '@/lib/files/sniff';
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
/**
 * Arquivo enviado junto do prompt.
 *
 * EXISTE POR UM MOTIVO SÓ: importar o currículo que a pessoa já tem — em PDF, em
 * PDF escaneado ou em FOTO. A foto não é luxo: boa parte de quem procura
 * emprego tem o currículo impresso e só o celular à mão.
 *
 * O conteúdo vai em base64 porque é assim que as duas APIs aceitam arquivo
 * embutido na requisição. Quem valida tamanho e tipo é a Server Action, antes
 * de chegar aqui — esta camada assume que o que recebeu já passou por isso.
 */
export interface AiAttachment {
  /**
   * O tipo REAL do arquivo, detectado pelos bytes — nunca o que o navegador
   * declarou. Ver `src/lib/files/sniff.ts`.
   */
  mimeType: TipoAceito;
  /** Conteúdo do arquivo, em base64, sem o prefixo `data:`. */
  dataBase64: string;
}

export interface AiTask<T> {
  /** Nome curto, usado em log e mensagem de erro. */
  name: string;
  system: string;
  prompt: string;
  /**
   * Arquivo que o modelo deve ler para responder.
   *
   * PROVEDOR QUE NÃO SUPORTA ANEXO TEM QUE FALHAR, NUNCA IGNORAR. Se o arquivo
   * sumisse no caminho, o modelo receberia "extraia os dados do PDF anexo" sem
   * PDF nenhum — e responderia inventando um currículo inteiro. Num produto que
   * promete não inventar nada sobre a vida de quem usa, esse é o pior desfecho
   * possível: falha silenciosa que produz dado falso com aparência de verdade.
   */
  attachment?: AiAttachment;
  /** Valida a saída do modelo. Texto que não passa aqui não chega à UI. */
  schema: ZodType<T>;
  maxTokens: number;
  /**
   * Quanto o modelo deve "pensar" antes de escrever.
   *
   * `'minimal'` só para tarefa de TRANSCRIÇÃO — copiar para um formato
   * estruturado o que já está escrito. Aí o raciocínio não decide nada e só
   * custa tempo: medido em 28/08/2026 com um PDF real de 23 KB, a importação
   * gastava 2.500 tokens de pensamento para escrever 931 de resposta, e levava
   * 20,1s. Com `'minimal'` foram 6,0s e ZERO tokens de pensamento — e o JSON
   * extraído saiu idêntico, campo por campo.
   *
   * NÃO É PARA AS DEMAIS TAREFAS, e a diferença não é de grau. Analisar um
   * currículo, comparar com uma vaga, reescrever um texto ou preparar
   * perguntas de entrevista são tarefas de JULGAMENTO: o raciocínio é onde o
   * trabalho acontece, e cortá-lo trocaria segundos por qualidade justamente
   * no que a pessoa está pagando para receber. Por isso o padrão é não mexer,
   * e cada tarefa que abre mão precisa dizer isso explicitamente aqui.
   *
   * O provedor que não souber controlar isto deve IGNORAR o campo, nunca
   * falhar: é preferência de desempenho, não requisito de correção.
   */
  reasoning?: 'default' | 'minimal';
  /**
   * Resultado do modo demonstração.
   *
   * REGRA: pode reorganizar, cortar e rotular o que o usuário forneceu.
   * Não pode inventar empresa, cargo, curso, número ou competência.
   */
  demo: () => T;
}

export interface AiProvider {
  id: 'gemini' | 'anthropic' | 'demo';
  mode: AiMode;
  run<T>(task: AiTask<T>): Promise<T>;
}

/** Erro de IA que a UI sabe exibir. Nunca vaza corpo de resposta cru para a tela. */
export class AiError extends Error {
  readonly task: string;
  readonly kind: 'configuracao' | 'rede' | 'formato' | 'limite' | 'bloqueio' | 'cota';
  /**
   * Mensagem específica para este caso, quando a genérica do `kind` não basta.
   *
   * Existe por causa da cota: "você já fez 40 análises hoje, o limite volta à
   * meia-noite" resolve o problema da pessoa; "limite atingido" só a deixa
   * clicando de novo.
   */
  private readonly friendly?: string;

  constructor(kind: AiError['kind'], task: string, message: string, friendly?: string) {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
    this.task = task;
    this.friendly = friendly;
  }

  /** Mensagem escrita para o usuário final, não para o log. */
  get userMessage(): string {
    if (this.friendly) return this.friendly;
    switch (this.kind) {
      case 'configuracao':
        return 'A IA não está configurada neste ambiente. Confira a chave de API nas variáveis de ambiente.';
      case 'limite':
        return 'A IA atingiu o limite de uso no momento. Tente de novo em alguns minutos.';
      case 'bloqueio':
        return 'Os filtros de conteúdo da IA recusaram este texto. Revise o que foi colado e tente de novo.';
      case 'cota':
        return 'Você atingiu o limite de análises deste período. Tente de novo mais tarde.';
      case 'formato':
        return 'A IA respondeu num formato inesperado. Tente de novo — se persistir, reduza o tamanho do texto enviado.';
      case 'rede':
      default:
        return 'Não conseguimos falar com a IA agora. Verifique sua conexão e tente de novo.';
    }
  }
}
