import { clamp, normalizeForCompare } from '@/lib/utils';
import type {
  AtsAnalysis,
  AtsCriterion,
  ResumeReview,
  ReviewDimension,
  ReviewDimensionId,
  ReviewIssue,
} from '@/types/ai';
import type { Resume } from '@/types/resume';
import { coveredTerms, extractKeywords } from './keywords';
import { polishParagraph, toBullets } from './text-polish';

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

// ---------------------------------------------------------------------------
// Análise completa — versão medida, sem IA
// ---------------------------------------------------------------------------

/**
 * O que fazer quando cada dimensão está baixa.
 *
 * É texto de produto, escrito uma vez e reaproveitado — não é o modelo
 * "sugerindo" algo. Nenhuma destas frases manda a pessoa inventar, exagerar ou
 * afirmar o que não é verdade; a de palavras-chave diz o contrário, explícito.
 */
const FIXES: Record<ReviewDimensionId, string> = {
  clareza:
    'Quebre os períodos longos em frases de uma linha. Um recrutador lê o currículo em poucos segundos e não volta atrás.',
  organizacao:
    'Preencha os dados de contato e mantenha a ordem esperada: contato, resumo, experiência, formação, competências.',
  erros:
    'Complete os campos que ficaram vazios. Campo em branco num currículo é lido como descuido, mesmo quando não é.',
  resumo:
    'Escreva de 4 a 6 linhas dizendo sua área, o que você já fez e o que busca. É a primeira coisa que se lê.',
  experiencias:
    'Descreva o que você fazia em cada experiência, começando por verbo de ação. Cargo e empresa sozinhos não dizem nada.',
  habilidades:
    'Cadastre as competências que você realmente usa no dia a dia, separando as técnicas das comportamentais.',
  'palavras-chave':
    'Use no seu texto os mesmos termos que a vaga usa — mas só onde for verdade. Escrever o que você não faz não passa na entrevista.',
  ats: 'Resolva primeiro os pontos acima que estiverem em vermelho. Eles puxam a nota geral para baixo.',
};

/** Campos essenciais em branco. É o mais perto de "erro" que dá para medir sem IA. */
function emptyEssentials(resume: Resume): string[] {
  const missing: string[] = [];
  if (!resume.personal.fullName.trim()) missing.push('nome');
  if (!resume.personal.email.trim()) missing.push('e-mail');
  if (!resume.personal.phone.trim()) missing.push('telefone');
  if (!resume.personal.city.trim()) missing.push('cidade');
  if (!resume.goal.targetRole.trim()) missing.push('cargo desejado');
  if (resume.experiences.some((experience) => !experience.role.trim())) {
    missing.push('cargo em alguma experiência');
  }
  if (resume.experiences.some((experience) => !experience.company.trim())) {
    missing.push('empresa em alguma experiência');
  }
  return missing;
}

/**
 * A nota que o currículo alcançaria depois de aplicadas as correções.
 *
 * NÃO É CHUTE E NÃO É PROMESSA: é o recálculo da mesma média com toda dimensão
 * abaixo de POTENTIAL_FLOOR elevada a POTENTIAL_TARGET. Uma conta declarada e
 * reproduzível, que dá o mesmo número toda vez para a mesma entrada. Inventar
 * um "potencial de 92%" para impressionar seria exatamente o tipo de número que
 * este produto não produz.
 */
const POTENTIAL_FLOOR = 70;
const POTENTIAL_TARGET = 85;

export function potentialFrom(scores: number[]): number {
  if (scores.length === 0) return 0;
  const raised = scores.map((score) => (score < POTENTIAL_FLOOR ? POTENTIAL_TARGET : score));
  const average = raised.reduce((total, score) => total + score, 0) / raised.length;
  const current = scores.reduce((total, score) => total + score, 0) / scores.length;
  // Nunca abaixo da nota atual: "potencial" que piora não é potencial.
  return Math.round(Math.max(average, current));
}

/**
 * Análise completa medida, sem IA.
 *
 * É o que o modo demonstração devolve — e, por ser medição de verdade, continua
 * útil sem chave de API nenhuma configurada. Também alimenta o prompt da versão
 * com IA, o que impede o modelo de chutar cobertura de palavra-chave.
 */
export function heuristicReview(resume: Resume, jobDescription: string): ResumeReview {
  const measured = heuristicAts(resume, jobDescription);
  const coverage = keywordCoverage(resume, jobDescription);
  const byId = new Map(measured.criteria.map((criterion) => [criterion.id, criterion]));
  const scoreOf = (id: AtsCriterion['id']) => byId.get(id)?.score ?? 0;
  const commentOf = (id: AtsCriterion['id']) => byId.get(id)?.comment ?? '';

  const missingFields = emptyEssentials(resume);
  const hasJob = jobDescription.trim().length > 0;

  const dimensions: ReviewDimension[] = [
    { id: 'clareza', label: 'Clareza', score: scoreOf('legibilidade'), comment: commentOf('legibilidade') },
    { id: 'organizacao', label: 'Organização', score: scoreOf('estrutura'), comment: commentOf('estrutura') },
    {
      id: 'erros',
      label: 'Erros e campos vazios',
      score: clamp(100 - missingFields.length * 15, 0, 100),
      comment:
        missingFields.length === 0
          ? 'Nenhum campo essencial em branco.'
          : `Campos essenciais em branco: ${missingFields.join(', ')}.`,
    },
    { id: 'resumo', label: 'Resumo profissional', score: scoreOf('clareza'), comment: commentOf('clareza') },
    { id: 'experiencias', label: 'Experiências', score: scoreOf('experiencia'), comment: commentOf('experiencia') },
    { id: 'habilidades', label: 'Habilidades', score: scoreOf('competencias'), comment: commentOf('competencias') },
    {
      id: 'palavras-chave',
      label: 'Palavras-chave',
      score: scoreOf('palavras-chave'),
      comment: commentOf('palavras-chave'),
    },
    {
      id: 'ats',
      label: 'Compatibilidade ATS',
      score: measured.score,
      comment: hasJob
        ? `Estimativa geral considerando a vaga informada (${coverage.covered.length} de ${coverage.terms.length} termos presentes).`
        : 'Estimativa geral. Cole uma vaga para medir também a aderência a ela.',
    },
  ];

  const scores = dimensions.map((dimension) => dimension.score);
  const score = Math.round(scores.reduce((total, item) => total + item, 0) / scores.length);

  const issues: ReviewIssue[] = dimensions
    .filter((dimension) => dimension.score < 70)
    .sort((a, b) => a.score - b.score)
    .map((dimension) => ({
      where: dimension.label,
      problem: dimension.comment,
      fix: FIXES[dimension.id],
      severity: dimension.score < 40 ? 'alta' : dimension.score < 60 ? 'media' : 'baixa',
    }));

  return {
    score,
    potentialScore: potentialFrom(scores),
    dimensions,
    strengths: dimensions.filter((dimension) => dimension.score >= 75).map((dimension) => dimension.comment),
    weaknesses: dimensions.filter((dimension) => dimension.score < 60).map((dimension) => dimension.comment),
    opportunities:
      coverage.missing.length > 0
        ? [
            `A vaga cita termos que não aparecem no seu currículo: ${coverage.missing.slice(0, 8).join(', ')}. Inclua apenas os que você realmente domina.`,
          ]
        : [],
    issues,
    recommendations: measured.recommendations,
    keywords: { present: coverage.covered, missing: coverage.missing },
    optimized: {
      summary: polishParagraph(resume.goal.summary).text,
      experiences: resume.experiences.map((experience) => ({
        id: experience.id,
        description: polishParagraph(experience.description).text,
        responsibilities:
          experience.responsibilities.length > 0
            ? experience.responsibilities.map((item) => polishParagraph(item).text)
            : toBullets(experience.description),
        // Resultados são copiados, nunca gerados.
        achievements: experience.achievements.map((item) => polishParagraph(item).text),
      })),
      skillsOrder: orderSkillsByJob(resume, jobDescription),
      notes: [
        'Modo demonstração: os textos foram apenas formatados e as competências reordenadas. Nenhuma reescrita real foi feita.',
      ],
    },
  };
}
