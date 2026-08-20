import { periodLabel } from '@/lib/utils';
import { EDUCATION_STATUS, LANGUAGE_LEVELS, type ResumeContent } from '@/types/resume';

/**
 * Modelo intermediário do currículo pronto para render.
 *
 * POR QUE ISTO EXISTE: o currículo é desenhado duas vezes — em HTML, para a
 * pré-visualização na tela, e em PDF, para o download. Se cada renderizador
 * lesse o `Resume` direto, os dois divergiriam no primeiro ajuste: alguém
 * corrigiria a ordem das seções na tela e o PDF continuaria com a antiga, e o
 * usuário baixaria algo diferente do que conferiu.
 *
 * Aqui ficam TODAS as decisões de conteúdo — que seções entram, em que ordem,
 * como cada linha é formatada, o que fazer com campo vazio. Os renderizadores
 * cuidam só de tipografia e espaçamento.
 */

export interface ResumeEntry {
  title: string;
  subtitle: string;
  meta: string;
  description?: string;
  bullets: string[];
}

export type ResumeSection =
  | { id: string; title: string; kind: 'paragraph'; paragraph: string }
  | { id: string; title: string; kind: 'entries'; entries: ResumeEntry[] }
  | { id: string; title: string; kind: 'inline'; items: string[] };

export interface ResumeHeader {
  name: string;
  role: string;
  /** Linha de contato já montada, com separadores. */
  contactLines: string[];
}

function statusLabel(status: string): string {
  return EDUCATION_STATUS.find((item) => item.id === status)?.label ?? status;
}

function levelLabel(level: string): string {
  return LANGUAGE_LEVELS.find((item) => item.id === level)?.label ?? level;
}

export function buildHeader(resume: ResumeContent): ResumeHeader {
  const location = [resume.personal.city, resume.personal.state].filter(Boolean).join('/');
  const primary = [resume.personal.phone, resume.personal.email, location].filter(Boolean);
  const links = [resume.personal.linkedin, resume.personal.portfolio, resume.personal.website].filter(Boolean);

  return {
    name: resume.personal.fullName,
    role: resume.goal.targetRole,
    // Duas linhas em vez de uma só: contato e links juntos numa linha só
    // estouram a largura da folha e quebram feio no meio de um endereço.
    contactLines: [primary.join('  •  '), links.join('  •  ')].filter((line) => line.length > 0),
  };
}

/**
 * Seções na ordem em que devem aparecer.
 *
 * Seção sem conteúdo é omitida — um título "IDIOMAS" seguido de nada é pior do
 * que não ter a seção. Para primeiro emprego e estágio, formação e projetos
 * sobem para antes da experiência, que é o recorte honesto de quem ainda não
 * tem histórico profissional.
 */
export function buildSections(resume: ResumeContent): ResumeSection[] {
  const entryLevel = resume.variant === 'primeiro-emprego' || resume.variant === 'estagio';
  const sections: ResumeSection[] = [];

  if (resume.goal.summary.trim()) {
    sections.push({
      id: 'resumo',
      title: 'Resumo profissional',
      kind: 'paragraph',
      paragraph: resume.goal.summary.trim(),
    });
  }

  const experienceSection: ResumeSection | null =
    resume.experiences.length > 0
      ? {
          id: 'experiencia',
          title: 'Experiência profissional',
          kind: 'entries',
          entries: resume.experiences.map((experience) => ({
            title: experience.role,
            subtitle: experience.company,
            meta: periodLabel(experience.startDate, experience.endDate, experience.current),
            description: experience.description.trim() || undefined,
            bullets: [...experience.responsibilities, ...experience.achievements],
          })),
        }
      : null;

  const educationSection: ResumeSection | null =
    resume.education.length > 0
      ? {
          id: 'formacao',
          title: 'Formação acadêmica',
          kind: 'entries',
          entries: resume.education.map((item) => ({
            title: item.course,
            subtitle: item.institution,
            meta: [periodLabel(item.startDate, item.endDate, false), statusLabel(item.status)]
              .filter(Boolean)
              .join('  •  '),
            description: item.degree.trim() || undefined,
            bullets: [],
          })),
        }
      : null;

  const projectSection: ResumeSection | null =
    resume.projects.length > 0
      ? {
          id: 'projetos',
          title: 'Projetos',
          kind: 'entries',
          entries: resume.projects.map((project) => ({
            title: project.name,
            subtitle: project.context,
            meta: project.link,
            description: project.description.trim() || undefined,
            bullets: [],
          })),
        }
      : null;

  const activitySection: ResumeSection | null =
    resume.activities.length > 0
      ? {
          id: 'atividades',
          title: 'Atividades e voluntariado',
          kind: 'entries',
          entries: resume.activities.map((activity) => ({
            title: activity.name,
            subtitle: activity.organization,
            meta: activity.period,
            description: activity.description.trim() || undefined,
            bullets: [],
          })),
        }
      : null;

  const ordered = entryLevel
    ? [educationSection, projectSection, activitySection, experienceSection]
    : [experienceSection, educationSection, projectSection, activitySection];

  for (const section of ordered) {
    if (section) sections.push(section);
  }

  if (resume.certifications.length > 0) {
    sections.push({
      id: 'cursos',
      title: 'Cursos e certificações',
      kind: 'entries',
      entries: resume.certifications.map((item) => ({
        title: item.name,
        subtitle: item.institution,
        meta: item.year,
        bullets: [],
      })),
    });
  }

  const technical = resume.skills.filter((skill) => skill.kind === 'tecnica').map((skill) => skill.name);
  const behavioral = resume.skills
    .filter((skill) => skill.kind === 'comportamental')
    .map((skill) => skill.name);

  if (technical.length > 0) {
    sections.push({ id: 'competencias-tecnicas', title: 'Competências técnicas', kind: 'inline', items: technical });
  }
  if (behavioral.length > 0) {
    sections.push({
      id: 'competencias-comportamentais',
      title: 'Competências comportamentais',
      kind: 'inline',
      items: behavioral,
    });
  }

  if (resume.languages.length > 0) {
    sections.push({
      id: 'idiomas',
      title: 'Idiomas',
      kind: 'inline',
      items: resume.languages.map((language) => `${language.name} — ${levelLabel(language.level)}`),
    });
  }

  return sections;
}

/** Nome do arquivo do PDF, sem acento e sem espaço. */
export function resumeFileName(resume: ResumeContent): string {
  // `NFD` separa a letra do acento; o intervalo seguinte remove as marcas de
  // acento que sobraram. Nome de arquivo com acento quebra download em alguns
  // navegadores e servidores.
  const base = (resume.personal.fullName || 'curriculo')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `curriculo-${base || 'sem-nome'}.pdf`;
}
