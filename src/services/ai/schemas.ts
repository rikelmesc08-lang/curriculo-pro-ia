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
const list = (max: number) => z.array(shortText).max(max).default([]);

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
        id: z.enum([
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
  body: z.array(longText).min(1).max(8),
  closing: shortText.default(''),
});

export const interviewQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question: shortText,
        kind: z.enum(['comportamental', 'tecnica', 'experiencia', 'pontos-fortes', 'desenvolvimento']),
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
