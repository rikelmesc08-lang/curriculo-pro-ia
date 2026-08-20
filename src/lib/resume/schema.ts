import { z } from 'zod';
import type { ResumeContent } from '@/types/resume';

/**
 * Validação do currículo que chega do cliente.
 *
 * Server Action é endpoint público: o payload não é o que o formulário mandou,
 * é o que QUALQUER pessoa mandou. Sem este schema, um cliente adulterado
 * gravaria um objeto de 40MB ou com campos que a UI nunca leria — e o banco
 * aceitaria.
 *
 * Os limites de tamanho são generosos para o uso real e apertados o bastante
 * para não virar depósito.
 */

const short = z.string().max(200).default('');
const medium = z.string().max(600).default('');
const long = z.string().max(5000).default('');
const bullets = z.array(z.string().max(600)).max(30).default([]);
const id = z.string().min(1).max(60);

const personalSchema = z.object({
  fullName: short,
  city: short,
  state: short,
  phone: short,
  email: short,
  linkedin: medium,
  portfolio: medium,
  website: medium,
});

const goalSchema = z.object({
  targetRole: short,
  area: short,
  summary: long,
});

const experienceSchema = z.object({
  id,
  company: short,
  role: short,
  startDate: short,
  endDate: short,
  current: z.boolean().default(false),
  description: long,
  responsibilities: bullets,
  achievements: bullets,
});

const educationSchema = z.object({
  id,
  institution: short,
  course: short,
  degree: short,
  startDate: short,
  endDate: short,
  status: z.enum(['concluido', 'cursando', 'trancado', 'incompleto']).default('cursando'),
});

const certificationSchema = z.object({
  id,
  name: short,
  institution: short,
  year: short,
});

const skillSchema = z.object({
  id,
  name: short,
  kind: z.enum(['tecnica', 'comportamental']).default('tecnica'),
});

const languageSchema = z.object({
  id,
  name: short,
  level: z.enum(['basico', 'intermediario', 'avancado', 'fluente', 'nativo']).default('basico'),
});

const projectSchema = z.object({
  id,
  name: short,
  context: short,
  description: long,
  link: medium,
});

const activitySchema = z.object({
  id,
  name: short,
  organization: short,
  period: short,
  description: long,
});

export const resumeContentSchema = z.object({
  title: z.string().min(1).max(120).default('Meu currículo'),
  variant: z
    .enum(['geral', 'vendas', 'administrativo', 'atendimento', 'tecnologia', 'estagio', 'primeiro-emprego'])
    .default('geral'),
  template: z
    .enum(['executivo', 'moderno', 'minimalista', 'corporativo', 'primeiro-emprego'])
    .default('moderno'),
  personal: personalSchema,
  goal: goalSchema,
  // Os tetos de quantidade evitam que um cliente adulterado grave dez mil
  // itens; nenhum currículo real chega perto disso.
  experiences: z.array(experienceSchema).max(30).default([]),
  education: z.array(educationSchema).max(20).default([]),
  certifications: z.array(certificationSchema).max(40).default([]),
  skills: z.array(skillSchema).max(60).default([]),
  languages: z.array(languageSchema).max(15).default([]),
  projects: z.array(projectSchema).max(25).default([]),
  activities: z.array(activitySchema).max(25).default([]),
});

export type ValidatedResumeContent = z.infer<typeof resumeContentSchema>;

/** Converte o resultado validado no tipo de domínio. */
export function parseResumeContent(input: unknown): ResumeContent {
  return resumeContentSchema.parse(input) as ResumeContent;
}
