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
