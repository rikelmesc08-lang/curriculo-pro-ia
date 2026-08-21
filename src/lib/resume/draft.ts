import { newId } from '@/lib/utils';
import type {
  Activity,
  Certification,
  Education,
  Experience,
  Language,
  Project,
  Resume,
  ResumeContent,
  ResumeVariant,
  Skill,
} from '@/types/resume';

/**
 * Regras do rascunho de currículo: itens em branco, etapas e completude.
 *
 * São funções puras, sem React e sem servidor, para poderem ser usadas nos
 * dois lados — o formulário calcula a completude enquanto a pessoa digita, e o
 * painel calcula a mesma coisa no servidor sem duplicar a regra.
 */

export function emptyExperience(): Experience {
  return {
    id: newId(),
    company: '',
    role: '',
    startDate: '',
    endDate: '',
    current: false,
    description: '',
    responsibilities: [],
    achievements: [],
  };
}

export function emptyEducation(): Education {
  return { id: newId(), institution: '', course: '', degree: '', startDate: '', endDate: '', status: '' };
}

export function emptyCertification(): Certification {
  return { id: newId(), name: '', institution: '', year: '' };
}

export function emptySkill(kind: Skill['kind']): Skill {
  return { id: newId(), name: '', kind };
}

export function emptyLanguage(): Language {
  return { id: newId(), name: '', level: 'basico' };
}

export function emptyProject(): Project {
  return { id: newId(), name: '', context: '', description: '', link: '' };
}

export function emptyActivity(): Activity {
  return { id: newId(), name: '', organization: '', period: '', description: '' };
}

/** Variantes em que o histórico profissional ainda não é o eixo do currículo. */
export function isEntryLevel(variant: ResumeVariant): boolean {
  return variant === 'primeiro-emprego' || variant === 'estagio';
}

export type StepId =
  | 'dados'
  | 'objetivo'
  | 'experiencia'
  | 'formacao'
  | 'projetos'
  | 'atividades'
  | 'cursos'
  | 'competencias'
  | 'idiomas'
  | 'revisao';

export interface StepDefinition {
  id: StepId;
  label: string;
}

/**
 * Etapas do formulário, na ordem, conforme a variante.
 *
 * Para primeiro emprego e estágio a formação vem antes da experiência e os
 * blocos de projetos e atividades entram no meio do caminho — é onde está o
 * lastro de quem ainda não tem carteira assinada. Pedir "experiência
 * profissional" como primeira coisa a quem não tem nenhuma é a forma mais
 * rápida de fazer a pessoa fechar a aba.
 */
export function stepsFor(variant: ResumeVariant): StepDefinition[] {
  if (isEntryLevel(variant)) {
    return [
      { id: 'dados', label: 'Dados pessoais' },
      { id: 'objetivo', label: 'Objetivo' },
      { id: 'formacao', label: 'Formação' },
      { id: 'projetos', label: 'Projetos' },
      { id: 'atividades', label: 'Atividades' },
      { id: 'experiencia', label: 'Experiência' },
      { id: 'cursos', label: 'Cursos' },
      { id: 'competencias', label: 'Competências' },
      { id: 'idiomas', label: 'Idiomas' },
      { id: 'revisao', label: 'Revisão' },
    ];
  }

  return [
    { id: 'dados', label: 'Dados pessoais' },
    { id: 'objetivo', label: 'Objetivo' },
    { id: 'experiencia', label: 'Experiência' },
    { id: 'formacao', label: 'Formação' },
    { id: 'cursos', label: 'Cursos' },
    { id: 'competencias', label: 'Competências' },
    { id: 'idiomas', label: 'Idiomas' },
    { id: 'projetos', label: 'Projetos' },
    { id: 'revisao', label: 'Revisão' },
  ];
}

export interface CompletenessItem {
  label: string;
  done: boolean;
  /** Sem isto o currículo não deveria ser enviado a lugar nenhum. */
  essential: boolean;
  hint: string;
}

/**
 * O que está pronto e o que falta.
 *
 * Alimenta a barra do painel e o aviso da tela de revisão. Só marca como
 * pendente o que a PESSOA precisa preencher — nunca sugere que a IA complete.
 */
export function completeness(resume: ResumeContent): {
  items: CompletenessItem[];
  percentage: number;
  missingEssentials: CompletenessItem[];
} {
  const entryLevel = isEntryLevel(resume.variant);

  const items: CompletenessItem[] = [
    {
      label: 'Nome completo',
      done: resume.personal.fullName.trim().length > 1,
      essential: true,
      hint: 'É como o recrutador vai te chamar.',
    },
    {
      label: 'Contato (e-mail e telefone)',
      done: resume.personal.email.trim().length > 3 && resume.personal.phone.trim().length > 7,
      essential: true,
      hint: 'Sem contato, nem o melhor currículo gera entrevista.',
    },
    {
      label: 'Cargo desejado',
      done: resume.goal.targetRole.trim().length > 1,
      essential: true,
      hint: 'Diz ao recrutador para qual posição ler o seu histórico.',
    },
    {
      label: 'Resumo profissional',
      done: resume.goal.summary.trim().length > 80,
      essential: false,
      hint: 'Quatro a seis linhas sobre quem você é profissionalmente.',
    },
    {
      label: entryLevel ? 'Projetos ou atividades' : 'Experiência profissional',
      done: entryLevel
        ? resume.projects.length > 0 || resume.activities.length > 0 || resume.experiences.length > 0
        : resume.experiences.length > 0,
      essential: true,
      hint: entryLevel
        ? 'Trabalhos acadêmicos, voluntariado e projetos pessoais contam.'
        : 'Pelo menos a experiência mais recente.',
    },
    {
      label: 'Formação acadêmica',
      done: resume.education.length > 0,
      essential: true,
      hint: 'Mesmo em andamento ou incompleta.',
    },
    {
      label: 'Competências',
      done: resume.skills.length >= 3,
      essential: false,
      hint: 'Pelo menos três, entre técnicas e comportamentais.',
    },
    {
      label: 'Idiomas',
      done: resume.languages.length > 0,
      essential: false,
      hint: 'Inclua o português se for relevante para a vaga.',
    },
  ];

  const done = items.filter((item) => item.done).length;

  return {
    items,
    percentage: Math.round((done / items.length) * 100),
    missingEssentials: items.filter((item) => item.essential && !item.done),
  };
}

/** Se existe conteúdo suficiente para gerar PDF ou mandar para a IA. */
export function isUsable(resume: ResumeContent): boolean {
  return completeness(resume).missingEssentials.length === 0;
}

/**
 * Extrai o conteúdo editável de um currículo persistido.
 *
 * Os campos são copiados um a um, e não por desestruturação com descarte: se um
 * campo novo entrar em `ResumeContent`, o TypeScript acusa a falta aqui. Com
 * `...resto`, ele passaria despercebido e sumiria do formulário sem erro.
 */
export function toContent(resume: Resume): ResumeContent {
  return {
    title: resume.title,
    variant: resume.variant,
    template: resume.template,
    personal: resume.personal,
    goal: resume.goal,
    experiences: resume.experiences,
    education: resume.education,
    certifications: resume.certifications,
    skills: resume.skills,
    languages: resume.languages,
    projects: resume.projects,
    activities: resume.activities,
  };
}
