/**
 * Tipos de tudo que a camada de IA devolve.
 *
 * Toda saída de IA é validada contra um schema Zod antes de chegar à UI
 * (`src/services/ai/schemas.ts`). Modelo de linguagem devolve texto; texto que
 * não passa no schema é erro tratado, não `any` espalhado pela tela.
 */

/** Qual provedor atendeu a chamada. A UI mostra isso ao usuário — sem fingir. */
export type AiMode = 'real' | 'demo';

export interface AiEnvelope<T> {
  mode: AiMode;
  data: T;
  /** Aviso exibido junto do resultado (ex.: modo demonstração ativo). */
  notice?: string;
  /**
   * Resultado reaproveitado de uma chamada anterior idêntica, sem custo novo.
   *
   * Aparece na UI. Um número que não muda depois de um clique precisa ter
   * explicação visível, senão parece que o botão quebrou.
   */
  cached?: boolean;
}

/**
 * Registro de uma chamada de IA já feita.
 *
 * Serve a DOIS propósitos com uma tabela só: contar quantas chamadas o usuário
 * fez na janela (limite de uso) e devolver a resposta guardada quando a mesma
 * pergunta se repete (cache). Servir do cache não cria registro novo — logo,
 * repetir a pergunta não consome cota.
 *
 * NÃO guarda o texto de entrada: só o `fingerprint`, que é um hash. O currículo
 * já mora na tabela de currículos; não há motivo para uma segunda cópia dele
 * espalhada aqui.
 */
export interface AiCallRecord {
  id: string;
  ownerId: string;
  /** Nome da tarefa, para diagnóstico e para o hash não colidir entre telas. */
  task: string;
  /** sha256 de (tarefa + entrada). Ver `src/server/ai-budget.ts`. */
  fingerprint: string;
  /** Saída já validada por schema, pronta para devolver de novo. */
  result: unknown;
  createdAt: string;
}

/** Item extraído da descrição da vaga. */
export interface JobAnalysis {
  role: string;
  seniority: string;
  company: string;
  skills: string[];
  tools: string[];
  qualifications: string[];
  responsibilities: string[];
  keywords: string[];
}

export interface MatchGap {
  /** O que a vaga pede. */
  item: string;
  /** Por que ficou de fora — sempre honesto: pode ser que o usuário não tenha. */
  reason: string;
  /** Sugestão de ação. Nunca "diga que você tem". */
  suggestion: string;
}

export interface JobMatch {
  /** 0–100. Indicador, não promessa. Ver `MATCH_DISCLAIMER`. */
  score: number;
  strengths: string[];
  gaps: MatchGap[];
  missingKeywords: string[];
  recommendations: string[];
}

export interface AtsCriterion {
  id: 'estrutura' | 'clareza' | 'palavras-chave' | 'compatibilidade' | 'legibilidade' | 'experiencia' | 'competencias';
  label: string;
  score: number;
  comment: string;
}

export interface AtsAnalysis {
  /** 0–100, média ponderada dos critérios. Estimativa. Ver `ATS_DISCLAIMER`. */
  score: number;
  criteria: AtsCriterion[];
  recommendations: string[];
}

export interface OptimizedResume {
  summary: string;
  /** Experiências reescritas, casadas por `id` com as originais. */
  experiences: { id: string; description: string; responsibilities: string[]; achievements: string[] }[];
  /** Competências reordenadas — apenas as que o usuário já declarou. */
  skillsOrder: string[];
  keywordsUsed: string[];
  notes: string[];
}

export interface CoverLetter {
  greeting: string;
  body: string[];
  closing: string;
}

export type InterviewQuestionKind = 'comportamental' | 'tecnica' | 'experiencia' | 'pontos-fortes' | 'desenvolvimento';

export interface InterviewQuestion {
  question: string;
  kind: InterviewQuestionKind;
  howToAnswer: string;
  structure: string[];
}

export type RecruiterMessageKind =
  | 'primeiro-contato'
  | 'resposta-recrutador'
  | 'follow-up'
  | 'agradecimento'
  | 'interesse-vaga'
  | 'atualizacao-processo';

export const RECRUITER_MESSAGE_KINDS: { id: RecruiterMessageKind; label: string; hint: string }[] = [
  { id: 'primeiro-contato', label: 'Primeiro contato', hint: 'Você está iniciando a conversa.' },
  { id: 'resposta-recrutador', label: 'Resposta a recrutador', hint: 'Alguém te procurou primeiro.' },
  { id: 'follow-up', label: 'Follow-up', hint: 'Retomar uma conversa que parou.' },
  { id: 'agradecimento', label: 'Agradecimento após entrevista', hint: 'Enviar logo depois da conversa.' },
  { id: 'interesse-vaga', label: 'Interesse em vaga', hint: 'Demonstrar interesse em uma vaga específica.' },
  { id: 'atualizacao-processo', label: 'Pedido de atualização', hint: 'Perguntar em que pé está o processo.' },
];

export interface RecruiterMessage {
  subject: string;
  body: string;
}

/** Texto reescrito + o que mudou, para o usuário conferir antes de aceitar. */
export interface RewrittenText {
  text: string;
  changes: string[];
}

export const MATCH_DISCLAIMER =
  'Indicador de compatibilidade baseado nas informações fornecidas. Não é garantia de contratação nem reflete o critério de nenhuma empresa específica.';

export const ATS_DISCLAIMER =
  'Estimativa baseada em boas práticas de currículo. Cada sistema ATS funciona de um jeito, e esta pontuação não reproduz o funcionamento exato de nenhum deles.';

export const INTEGRITY_DISCLAIMER =
  'A IA reorganiza e melhora o que você escreveu. Ela não cria experiências, empresas, cursos, números ou resultados que você não informou.';

/** Saída de `improveExperience`: os três campos reescritos mais o que mudou. */
export interface RewrittenExperience {
  description: string;
  responsibilities: string[];
  achievements: string[];
  changes: string[];
}

// ---------------------------------------------------------------------------
// Análise completa do currículo
// ---------------------------------------------------------------------------

/**
 * As oito dimensões avaliadas.
 *
 * São ids fechados, e não texto livre, porque a tela desenha uma barra por
 * dimensão e a comparação entre duas análises do mesmo currículo só faz sentido
 * se as dimensões forem sempre as mesmas.
 */
export type ReviewDimensionId =
  | 'clareza'
  | 'organizacao'
  | 'erros'
  | 'resumo'
  | 'experiencias'
  | 'habilidades'
  | 'palavras-chave'
  | 'ats';

export interface ReviewDimension {
  id: ReviewDimensionId;
  label: string;
  /** 0–100. */
  score: number;
  comment: string;
}

/** Um problema concreto encontrado, com onde está e como resolver. */
export interface ReviewIssue {
  /** Onde está, em linguagem de usuário: "Resumo profissional", "Experiência na Loja X". */
  where: string;
  problem: string;
  /** O que fazer. Nunca "invente um número" nem "diga que você tem". */
  fix: string;
  severity: 'alta' | 'media' | 'baixa';
}

/**
 * A versão otimizada do currículo.
 *
 * Mesma forma de `OptimizedResume`, e isso é de propósito: as experiências são
 * casadas por `id` na hora de aplicar (`applyOptimizationAction`), então um id
 * inventado pelo modelo é descartado pelo código, não pela boa vontade dele.
 */
export interface ReviewOptimizedResume {
  summary: string;
  experiences: { id: string; description: string; responsibilities: string[]; achievements: string[] }[];
  skillsOrder: string[];
  notes: string[];
}

/** Resultado completo. Só chega inteiro a quem tem direito a ele. */
export interface ResumeReview {
  /** 0–100, o currículo como está hoje. */
  score: number;
  /**
   * 0–100, o mesmo currículo depois de aplicadas as correções apontadas.
   *
   * É a "indicação de quanto dá para melhorar". Nunca é menor que `score`, e
   * não é promessa de contratação — ver `REVIEW_DISCLAIMER`.
   */
  potentialScore: number;
  dimensions: ReviewDimension[];
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  issues: ReviewIssue[];
  recommendations: string[];
  keywords: { present: string[]; missing: string[] };
  optimized: ReviewOptimizedResume;
}

/**
 * O que o plano gratuito recebe.
 *
 * É um TIPO SEPARADO, e não `Partial<ResumeReview>`, porque a diferença entre
 * os dois precisa ser visível no compilador. A prévia é MONTADA CAMPO A CAMPO a
 * partir do resultado completo (ver `src/services/ai/review-gate.ts`) — nunca
 * espalhada com `...review` e depois podada. Espalhar-e-podar é como vaza
 * conteúdo pago: basta alguém acrescentar um campo novo ao tipo completo e
 * esquecer de removê-lo aqui.
 */
export interface ResumeReviewPreview {
  score: number;
  potentialScore: number;
  dimensions: ReviewDimension[];
  strengths: string[];
  /** Alguns problemas, com a correção junto — a prévia precisa ser útil de verdade. */
  issues: ReviewIssue[];
  /** Primeiras linhas do resumo reescrito, cortadas. */
  summaryPreview: string;
  /** Quanto ficou de fora, para o CTA poder ser específico em vez de vago. */
  hidden: {
    issues: number;
    recommendations: number;
    rewrittenExperiences: number;
    opportunities: number;
  };
}

/**
 * O que a Server Action devolve.
 *
 * União discriminada de propósito: não existe "objeto completo com uns campos
 * apagados" trafegando até o navegador. Quem não pagou recebe um objeto que
 * nunca conteve o texto pago — esconder no cliente com CSS seria entregar o
 * conteúdo para qualquer pessoa que abrisse as ferramentas de desenvolvedor.
 */
export type ReviewDelivery =
  | { access: 'completo'; review: ResumeReview }
  | { access: 'previa'; preview: ResumeReviewPreview };

export const REVIEW_DISCLAIMER =
  'Pontuação estimada a partir de boas práticas de currículo e da vaga informada. Não reproduz o funcionamento de nenhum ATS específico nem prevê resultado de processo seletivo.';
