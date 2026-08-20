import { clamp, normalizeForCompare } from '@/lib/utils';
import type { AtsAnalysis, AtsCriterion } from '@/types/ai';
import type { Resume } from '@/types/resume';
import { coveredTerms, extractKeywords } from './keywords';

/**
 * Medições sobre o currículo que NÃO precisam de IA.
 *
 * Tudo aqui é contagem e comparação de texto: quantas experiências têm
 * descrição, se há e-mail e telefone, qual porcentagem dos termos da vaga
 * aparece no currículo. Duas razões para isso não ser uma chamada de modelo:
 *
 *   1. é reproduzível — a mesma entrada dá a mesma nota, sempre. Nota que
 *      muda a cada clique destrói a confiança do usuário no indicador;
 *   2. é barato e instantâneo, e o resultado alimenta o prompt da análise
 *      real, o que impede o modelo de chutar cobertura de palavra-chave.
 *
 * A pontuação continua sendo ESTIMATIVA de boas práticas. Não reproduz nenhum
 * ATS real, e a UI diz isso em toda tela onde o número aparece.
 */

/** Todo o texto livre do currículo, para busca de termo. */
export function resumeSearchText(resume: Resume): string {
  return [
    resume.goal.targetRole,
    resume.goal.area,
    resume.goal.summary,
    ...resume.experiences.flatMap((experience) => [
      experience.role,
      experience.company,
      experience.description,
      ...experience.responsibilities,
      ...experience.achievements,
    ]),
    ...resume.education.map((item) => `${item.course} ${item.institution} ${item.degree}`),
    ...resume.certifications.map((item) => `${item.name} ${item.institution}`),
    ...resume.skills.map((skill) => skill.name),
    ...resume.languages.map((language) => language.name),
    ...resume.projects.map((project) => `${project.name} ${project.context} ${project.description}`),
    ...resume.activities.map((activity) => `${activity.name} ${activity.organization} ${activity.description}`),
  ]
    .filter(Boolean)
    .join(' \n ');
}

export interface KeywordCoverage {
  terms: string[];
  covered: string[];
  missing: string[];
  /** 0–100. `0` quando não há vaga para comparar. */
  percentage: number;
}

export function keywordCoverage(resume: Resume, jobDescription: string): KeywordCoverage {
  const terms = extractKeywords(jobDescription, 20);
  if (terms.length === 0) return { terms: [], covered: [], missing: [], percentage: 0 };

  const text = resumeSearchText(resume);
  const covered = coveredTerms(terms, text);
  const coveredSet = new Set(covered);

  return {
    terms,
    covered,
    missing: terms.filter((term) => !coveredSet.has(term)),
    percentage: Math.round((covered.length / terms.length) * 100),
  };
}

/** Quantos campos de contato essenciais foram preenchidos. */
function contactScore(resume: Resume): number {
  const fields = [
    resume.personal.fullName,
    resume.personal.email,
    resume.personal.phone,
    resume.personal.city,
  ];
  const filled = fields.filter((field) => field.trim().length > 0).length;
  return Math.round((filled / fields.length) * 100);
}

/** Frase longa demais é o inimigo número um da leitura rápida do recrutador. */
function averageSentenceLength(text: string): number {
  const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  if (sentences.length === 0) return 0;
  const words = sentences.reduce((total, sentence) => total + sentence.split(/\s+/).length, 0);
  return words / sentences.length;
}

/**
 * Análise ATS medida, sem IA.
 *
 * Também é o que o modo demonstração devolve — e por ser medição de verdade,
 * o resultado é útil mesmo sem chave de API configurada.
 */
export function heuristicAts(resume: Resume, jobDescription: string): AtsAnalysis {
  const text = resumeSearchText(resume);
  const coverage = keywordCoverage(resume, jobDescription);
  const hasJob = jobDescription.trim().length > 0;

  const experiencesWithDetail = resume.experiences.filter(
    (experience) => experience.description.trim().length > 0 || experience.responsibilities.length > 0
  ).length;

  const summaryLength = resume.goal.summary.trim().length;
  const sentenceLength = averageSentenceLength(text);
  const technicalSkills = resume.skills.filter((skill) => skill.kind === 'tecnica').length;

  const criteria: AtsCriterion[] = [
    {
      id: 'estrutura',
      label: 'Estrutura',
      score: Math.round(
        contactScore(resume) * 0.4 +
          (resume.education.length > 0 ? 30 : 0) +
          (resume.experiences.length > 0 || resume.projects.length > 0 ? 30 : 0)
      ),
      comment:
        contactScore(resume) === 100
          ? 'Dados de contato completos e seções na ordem esperada.'
          : 'Faltam dados de contato. Nome, e-mail, telefone e cidade são o mínimo que um recrutador precisa.',
    },
    {
      id: 'clareza',
      label: 'Clareza',
      score:
        summaryLength === 0
          ? 20
          : clamp(Math.round(100 - Math.abs(summaryLength - 500) / 8), 30, 100),
      comment:
        summaryLength === 0
          ? 'Sem resumo profissional. É a primeira coisa que se lê no currículo.'
          : summaryLength < 250
            ? 'Resumo curto. Vale detalhar sua área de atuação e o que você busca.'
            : summaryLength > 900
              ? 'Resumo longo. Um parágrafo de 4 a 6 linhas costuma funcionar melhor.'
              : 'Resumo com tamanho adequado para leitura rápida.',
    },
    {
      id: 'palavras-chave',
      label: 'Palavras-chave',
      score: hasJob ? coverage.percentage : clamp(technicalSkills * 12, 0, 80),
      comment: hasJob
        ? `${coverage.covered.length} de ${coverage.terms.length} termos frequentes da vaga aparecem no seu currículo.`
        : 'Cole a descrição de uma vaga para medir a aderência aos termos que ela usa.',
    },
    {
      id: 'compatibilidade',
      label: 'Compatibilidade com a vaga',
      score: hasJob ? coverage.percentage : 0,
      comment: hasJob
        ? 'Comparação direta entre os termos da vaga e o texto do seu currículo.'
        : 'Ainda não medida: nenhuma vaga foi informada.',
    },
    {
      id: 'legibilidade',
      label: 'Legibilidade',
      score:
        sentenceLength === 0
          ? 0
          : sentenceLength <= 22
            ? 100
            : clamp(Math.round(100 - (sentenceLength - 22) * 5), 30, 95),
      comment:
        sentenceLength === 0
          ? 'Ainda não há texto suficiente para avaliar.'
          : sentenceLength <= 22
            ? 'Frases curtas e diretas — bom para leitura em poucos segundos.'
            : 'Frases longas. Quebrar em períodos menores facilita a leitura.',
    },
    {
      id: 'experiencia',
      label: 'Experiência profissional',
      score:
        resume.experiences.length === 0
          ? resume.projects.length > 0
            ? 45
            : 10
          : clamp(Math.round((experiencesWithDetail / resume.experiences.length) * 100), 20, 100),
      comment:
        resume.experiences.length === 0
          ? 'Nenhuma experiência registrada. Se este é seu primeiro emprego, use projetos, voluntariado e atividades acadêmicas.'
          : experiencesWithDetail === resume.experiences.length
            ? 'Todas as experiências têm descrição.'
            : 'Há experiências sem descrição. Cada uma deveria dizer o que você fazia.',
    },
    {
      id: 'competencias',
      label: 'Competências',
      score: clamp(resume.skills.length * 10, 0, 100),
      comment:
        resume.skills.length === 0
          ? 'Nenhuma competência cadastrada.'
          : `${resume.skills.length} competências cadastradas (${technicalSkills} técnicas).`,
    },
  ];

  // Média simples: sem dado real sobre o peso que cada ATS dá a cada item,
  // inventar pesos daria falsa precisão a uma estimativa.
  const score = Math.round(criteria.reduce((total, item) => total + item.score, 0) / criteria.length);

  const recommendations: string[] = [];
  for (const criterion of criteria) {
    if (criterion.score < 70) recommendations.push(criterion.comment);
  }
  if (hasJob && coverage.missing.length > 0) {
    recommendations.push(
      `Termos da vaga ausentes: ${coverage.missing.slice(0, 6).join(', ')}. Inclua apenas os que você realmente domina.`
    );
  }
  if (recommendations.length === 0) {
    recommendations.push('Nenhum ponto crítico encontrado nesta verificação automática.');
  }

  return { score, criteria, recommendations };
}

/** Competências do usuário ordenadas por presença na vaga. Não adiciona nada. */
export function orderSkillsByJob(resume: Resume, jobDescription: string): string[] {
  const job = normalizeForCompare(jobDescription);
  return [...resume.skills]
    .map((skill) => ({ skill, hit: job.includes(normalizeForCompare(skill.name)) }))
    .sort((a, b) => Number(b.hit) - Number(a.hit))
    .map((entry) => entry.skill.name);
}
