/**
 * Modelo de domínio do currículo.
 *
 * REGRA QUE ATRAVESSA TODO O ARQUIVO: cada campo aqui guarda **informação que
 * o usuário digitou**. Nenhuma camada — nem a de IA — pode preencher um campo
 * destes com fato que o usuário não forneceu. A IA reescreve o texto de
 * `description`, `summary` e afins; ela nunca cria uma `Experience`, uma
 * `Education` ou uma `Certification` do nada. Ver `src/services/ai/prompts.ts`.
 */

/** Identificador estável de item de lista, gerado no cliente. */
export type ItemId = string;

/** Variação do currículo — o mesmo conjunto de fatos, com recorte diferente. */
export type ResumeVariant =
  | 'geral'
  | 'vendas'
  | 'administrativo'
  | 'atendimento'
  | 'tecnologia'
  | 'estagio'
  | 'primeiro-emprego';

export const RESUME_VARIANTS: { id: ResumeVariant; label: string; hint: string }[] = [
  { id: 'geral', label: 'Currículo geral', hint: 'Serve para a maioria das candidaturas.' },
  { id: 'vendas', label: 'Vendas', hint: 'Destaca atendimento, negociação e metas.' },
  { id: 'administrativo', label: 'Administrativo', hint: 'Destaca organização, rotinas e processos.' },
  { id: 'atendimento', label: 'Atendimento', hint: 'Destaca comunicação e suporte ao cliente.' },
  { id: 'tecnologia', label: 'Tecnologia', hint: 'Destaca ferramentas, projetos e stack.' },
  { id: 'estagio', label: 'Estágio', hint: 'Formato para estudantes em busca de estágio.' },
  { id: 'primeiro-emprego', label: 'Primeiro emprego', hint: 'Para quem ainda não teve registro em carteira.' },
];

/** Modelo visual. Todos são de coluna única e legíveis por ATS. */
export type TemplateId = 'executivo' | 'moderno' | 'minimalista' | 'corporativo' | 'primeiro-emprego';

export interface PersonalInfo {
  fullName: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  linkedin: string;
  portfolio: string;
  website: string;
}

export interface ProfessionalGoal {
  targetRole: string;
  area: string;
  /** Resumo profissional. A IA pode reescrever; não pode inventar fatos novos. */
  summary: string;
}

export interface Experience {
  id: ItemId;
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
  /** Uma responsabilidade por linha. */
  responsibilities: string[];
  /** Resultados/conquistas — só o que o usuário afirmou. Números nunca são inferidos. */
  achievements: string[];
}

export type EducationStatus = 'concluido' | 'cursando' | 'trancado' | 'incompleto';

export const EDUCATION_STATUS: { id: EducationStatus; label: string }[] = [
  { id: 'concluido', label: 'Concluído' },
  { id: 'cursando', label: 'Cursando' },
  { id: 'trancado', label: 'Trancado' },
  { id: 'incompleto', label: 'Incompleto' },
];

export interface Education {
  id: ItemId;
  institution: string;
  course: string;
  degree: string;
  startDate: string;
  endDate: string;
  status: EducationStatus;
}

export interface Certification {
  id: ItemId;
  name: string;
  institution: string;
  year: string;
}

export type SkillKind = 'tecnica' | 'comportamental';

export interface Skill {
  id: ItemId;
  name: string;
  kind: SkillKind;
}

export type LanguageLevel = 'basico' | 'intermediario' | 'avancado' | 'fluente' | 'nativo';

export const LANGUAGE_LEVELS: { id: LanguageLevel; label: string }[] = [
  { id: 'basico', label: 'Básico' },
  { id: 'intermediario', label: 'Intermediário' },
  { id: 'avancado', label: 'Avançado' },
  { id: 'fluente', label: 'Fluente' },
  { id: 'nativo', label: 'Nativo' },
];

export interface Language {
  id: ItemId;
  name: string;
  level: LanguageLevel;
}

/** Projeto, trabalho acadêmico ou pessoal — o lastro de quem não tem carteira assinada. */
export interface Project {
  id: ItemId;
  name: string;
  context: string;
  description: string;
  link: string;
}

/** Voluntariado e atividades extracurriculares. */
export interface Activity {
  id: ItemId;
  name: string;
  organization: string;
  period: string;
  description: string;
}

export interface Resume {
  id: string;
  ownerId: string;
  title: string;
  variant: ResumeVariant;
  template: TemplateId;
  personal: PersonalInfo;
  goal: ProfessionalGoal;
  experiences: Experience[];
  education: Education[];
  certifications: Certification[];
  skills: Skill[];
  languages: Language[];
  projects: Project[];
  activities: Activity[];
  createdAt: string;
  updatedAt: string;
}

/** O conteúdo do currículo sem os metadados de persistência. */
export type ResumeContent = Omit<Resume, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>;

export function emptyResumeContent(): ResumeContent {
  return {
    title: 'Meu currículo',
    variant: 'geral',
    template: 'moderno',
    personal: {
      fullName: '',
      city: '',
      state: '',
      phone: '',
      email: '',
      linkedin: '',
      portfolio: '',
      website: '',
    },
    goal: { targetRole: '', area: '', summary: '' },
    experiences: [],
    education: [],
    certifications: [],
    skills: [],
    languages: [],
    projects: [],
    activities: [],
  };
}
