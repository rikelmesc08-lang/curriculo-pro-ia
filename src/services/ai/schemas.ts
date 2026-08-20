import { z } from 'zod';

/**
 * Schemas de tudo que a IA devolve.
 *
 * Modelo de linguagem devolve texto. Texto vira objeto só depois de passar por
 * aqui — e se não passar, o usuário vê "a IA respondeu num formato inesperado,
 * tente de novo", não um `undefined` explodindo três componentes abaixo.
 *
 * Os limites (`max`) não são decoração: impedem que uma resposta descontrolada
 * do modelo vire uma tela com trezentos itens.
 */

const shortText = z.string().trim().max(300);
const longText = z.string().trim().max(4000);

/**
 * Lista de textos, tolerante ao erro mais comum do modelo.
 *
 * OBSERVADO EM PRODUÇÃO, não teorizado: pedindo `["a", "b"]`, o modelo às vezes
 * devolve `"a, b"` — um campo de lista como texto corrido. O schema recusava, a
 * retentativa gastava uma segunda chamada, e às vezes a segunda errava igual;
 * o usuário via "a IA respondeu num formato inesperado" depois de um minuto
 * esperando.
 *
 * Converter texto em lista de um item aqui é reparo trivial e sem ambiguidade.
 * O que este preprocess NÃO faz é inventar conteúdo: string vazia vira lista
 * vazia, e o que não for texto nem lista continua sendo recusado.
 */
function textList(max: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' ? (value.trim() ? [value] : []) : value),
    z.array(shortText).max(max)
  ).default([]);
}

const list = textList;

/**
 * Enum tolerante a acento e caixa.
 *
 * OBSERVADO EM PRODUÇÃO: pedindo `"media"`, um modelo devolveu a forma acentuada
 * e o schema recusou a resposta inteira — perdendo uma análise completa por
 * causa de um til. Os ids do produto são todos escritos sem acento justamente
 * para que normalizar aqui seja sempre seguro: para um valor correto, este
 * preprocess não faz nada.
 *
 * O que ele NÃO faz é adivinhar sinônimo. "alto" continua sendo recusado, e
 * deve ser: aceitar um valor que o produto não definiu seria inventar
 * significado em cima do que o modelo escreveu.
 *
 * O `const` no parâmetro de tipo não é enfeite: sem ele, o TypeScript alarga os
 * valores para `string`, o schema passa a prometer `string` em vez da união
 * literal, e todo o ganho de tipar os ids se perde em silêncio.
 */
function looseEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const semAcento = value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return (values as readonly string[]).includes(semAcento) ? semAcento : value;
  }, z.enum(values));
}

export const jobAnalysisSchema = z.object({
  role: shortText.default(''),
  seniority: shortText.default(''),
  company: shortText.default(''),
  skills: list(25),
  tools: list(25),
  qualifications: list(20),
  responsibilities: list(20),
  keywords: list(40),
});

export const jobMatchSchema = z.object({
  score: z.number().min(0).max(100),
  strengths: list(15),
  gaps: z
    .array(
      z.object({
        item: shortText,
        reason: shortText,
        suggestion: shortText,
      })
    )
    .max(15)
    .default([]),
  missingKeywords: list(25),
  recommendations: list(15),
});

export const atsAnalysisSchema = z.object({
  score: z.number().min(0).max(100),
  criteria: z
    .array(
      z.object({
        id: looseEnum([
          'estrutura',
          'clareza',
          'palavras-chave',
          'compatibilidade',
          'legibilidade',
          'experiencia',
          'competencias',
        ]),
        label: shortText,
        score: z.number().min(0).max(100),
        comment: shortText,
      })
    )
    .max(7)
    .default([]),
  recommendations: list(15),
});

export const optimizedResumeSchema = z.object({
  summary: longText.default(''),
  experiences: z
    .array(
      z.object({
        id: z.string(),
        description: longText.default(''),
        responsibilities: list(15),
        achievements: list(15),
      })
    )
    .max(30)
    .default([]),
  skillsOrder: list(60),
  keywordsUsed: list(40),
  notes: list(15),
});

export const coverLetterSchema = z.object({
  greeting: shortText.default(''),
  body: z.preprocess(
    (value) => (typeof value === 'string' ? [value] : value),
    z.array(longText).min(1).max(8)
  ),
  closing: shortText.default(''),
});

export const interviewQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question: shortText,
        kind: looseEnum(['comportamental', 'tecnica', 'experiencia', 'pontos-fortes', 'desenvolvimento']),
        howToAnswer: longText,
        structure: list(8),
      })
    )
    .min(1)
    .max(15),
});

export const recruiterMessageSchema = z.object({
  subject: shortText.default(''),
  body: longText,
});

export const rewrittenTextSchema = z.object({
  text: longText,
  changes: list(10),
});

export const rewrittenExperienceSchema = z.object({
  description: longText,
  responsibilities: list(15),
  achievements: list(15),
  changes: list(10),
});

/**
 * Análise completa.
 *
 * Os `max` são o teto do que a tela aguenta desenhar, e também o teto do que
 * uma resposta descontrolada consegue custar em renderização. `dimensions` é
 * `.max(8)` porque são exatamente oito ids possíveis.
 */
export const resumeReviewSchema = z.object({
  score: z.number().min(0).max(100),
  potentialScore: z.number().min(0).max(100),
  dimensions: z
    .array(
      z.object({
        id: looseEnum([
          'clareza',
          'organizacao',
          'erros',
          'resumo',
          'experiencias',
          'habilidades',
          'palavras-chave',
          'ats',
        ]),
        label: shortText,
        score: z.number().min(0).max(100),
        comment: shortText,
      })
    )
    .max(8)
    .default([]),
  strengths: list(12),
  weaknesses: list(12),
  opportunities: list(12),
  issues: z
    .array(
      z.object({
        where: shortText,
        problem: shortText,
        fix: shortText,
        severity: looseEnum(['alta', 'media', 'baixa']),
      })
    )
    .max(20)
    .default([]),
  recommendations: list(15),
  keywords: z
    .object({
      present: list(40),
      missing: list(40),
    })
    .default({ present: [], missing: [] }),
  optimized: z
    .object({
      summary: longText.default(''),
      experiences: z
        .array(
          z.object({
            id: z.string(),
            description: longText.default(''),
            responsibilities: list(15),
            achievements: list(15),
          })
        )
        .max(30)
        .default([]),
      skillsOrder: list(60),
      notes: list(15),
    })
    .default({ summary: '', experiences: [], skillsOrder: [], notes: [] }),
});
