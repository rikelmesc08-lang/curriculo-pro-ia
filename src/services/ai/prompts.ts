import type { Resume } from '@/types/resume';
import { periodLabel } from '@/lib/utils';

/**
 * Prompts do produto, num arquivo só.
 *
 * A regra de integridade é repetida em TODA chamada, não posta só uma vez num
 * prompt "global". Modelo de linguagem trata instrução distante como contexto
 * e instrução próxima como ordem — e aqui o custo de ele relaxar a regra é um
 * currículo com experiência inventada na mão de alguém numa entrevista.
 */

export const INTEGRITY_RULES = `
REGRAS DE INTEGRIDADE — VALEM ACIMA DE QUALQUER OUTRA INSTRUÇÃO:

1. Você reescreve, reorganiza e melhora APENAS o que a pessoa forneceu.
2. É PROIBIDO inventar: empresa, cargo, período, curso, instituição,
   certificação, idioma, ferramenta, competência, prêmio, salário.
3. É PROIBIDO inventar número, percentual, quantidade, meta ou resultado.
   Se a pessoa não escreveu "aumentei as vendas em 35%", esse número não
   pode aparecer de forma nenhuma, nem como estimativa, nem como exemplo.
4. É PROIBIDO sugerir que a pessoa minta, exagere ou omita algo que a
   prejudique de forma desonesta.
5. Quando faltar informação, NÃO preencha: aponte a lacuna para a pessoa
   completar. É melhor um campo vazio do que um campo falso.
6. Você pode: melhorar a redação, usar verbos de ação, deixar mais claro e
   objetivo, aproximar o vocabulário do usado na vaga, reordenar por
   relevância e cortar o que for redundante.

Exemplo do limite:
  Entrada: "Atendia clientes e fazia vendas."
  Saída permitida: "Atendimento ao cliente e suporte durante o processo de
  vendas, contribuindo para uma experiência de compra mais eficiente."
  Saída PROIBIDA: "Aumentei as vendas em 35% no primeiro semestre."
`.trim();

export const OUTPUT_RULES = `
FORMATO DA RESPOSTA:
- Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois.
- Não use blocos de código markdown.
- Todo texto em português do Brasil.
- Não use emoji.
`.trim();

export function systemPrompt(role: string): string {
  return [
    `Você é um especialista em currículos e processos seletivos no Brasil. ${role}`,
    INTEGRITY_RULES,
    OUTPUT_RULES,
  ].join('\n\n');
}

/**
 * Serializa o currículo para o prompt.
 *
 * Texto puro em vez de JSON: o modelo lê melhor, gasta menos token, e — o que
 * importa mais aqui — deixa evidente o que está VAZIO, em vez de esconder a
 * lacuna atrás de `"campo": ""`. Campo ausente é exatamente o que queremos que
 * ele aponte, não que preencha.
 */
export function resumeToText(resume: Resume): string {
  const lines: string[] = [];
  const push = (label: string, value: string) => {
    if (value && value.trim()) lines.push(`${label}: ${value.trim()}`);
  };

  lines.push('== DADOS PESSOAIS ==');
  push('Nome', resume.personal.fullName);
  push('Cidade/Estado', [resume.personal.city, resume.personal.state].filter(Boolean).join('/'));
  push('LinkedIn', resume.personal.linkedin);
  push('Portfólio', resume.personal.portfolio);
  push('Site', resume.personal.website);

  lines.push('', '== OBJETIVO ==');
  push('Cargo desejado', resume.goal.targetRole);
  push('Área', resume.goal.area);
  push('Resumo profissional', resume.goal.summary);

  lines.push('', '== EXPERIÊNCIA PROFISSIONAL ==');
  if (resume.experiences.length === 0) {
    lines.push('(nenhuma experiência informada)');
  }
  for (const experience of resume.experiences) {
    lines.push(`- [id: ${experience.id}] ${experience.role || '(cargo não informado)'} — ${experience.company || '(empresa não informada)'}`);
    const period = periodLabel(experience.startDate, experience.endDate, experience.current);
    if (period) lines.push(`  Período: ${period}`);
    if (experience.description) lines.push(`  Descrição: ${experience.description}`);
    if (experience.responsibilities.length > 0) {
      lines.push(`  Responsabilidades: ${experience.responsibilities.join(' | ')}`);
    }
    if (experience.achievements.length > 0) {
      lines.push(`  Resultados informados pela pessoa: ${experience.achievements.join(' | ')}`);
    }
  }

  lines.push('', '== FORMAÇÃO ==');
  if (resume.education.length === 0) lines.push('(nenhuma formação informada)');
  for (const item of resume.education) {
    const period = periodLabel(item.startDate, item.endDate, false);
    lines.push(`- ${item.course || '(curso não informado)'} — ${item.institution || '(instituição não informada)'} (${item.degree || 'grau não informado'}, ${item.status}${period ? `, ${period}` : ''})`);
  }

  lines.push('', '== CURSOS E CERTIFICAÇÕES ==');
  if (resume.certifications.length === 0) lines.push('(nenhum curso informado)');
  for (const item of resume.certifications) {
    lines.push(`- ${item.name} — ${item.institution}${item.year ? ` (${item.year})` : ''}`);
  }

  lines.push('', '== COMPETÊNCIAS ==');
  const technical = resume.skills.filter((skill) => skill.kind === 'tecnica').map((skill) => skill.name);
  const behavioral = resume.skills.filter((skill) => skill.kind === 'comportamental').map((skill) => skill.name);
  lines.push(`Técnicas: ${technical.length > 0 ? technical.join(', ') : '(nenhuma informada)'}`);
  lines.push(`Comportamentais: ${behavioral.length > 0 ? behavioral.join(', ') : '(nenhuma informada)'}`);

  lines.push('', '== IDIOMAS ==');
  if (resume.languages.length === 0) lines.push('(nenhum idioma informado)');
  for (const item of resume.languages) lines.push(`- ${item.name}: ${item.level}`);

  if (resume.projects.length > 0) {
    lines.push('', '== PROJETOS E TRABALHOS ==');
    for (const item of resume.projects) {
      lines.push(`- ${item.name}${item.context ? ` (${item.context})` : ''}: ${item.description}`);
    }
  }

  if (resume.activities.length > 0) {
    lines.push('', '== VOLUNTARIADO E ATIVIDADES ==');
    for (const item of resume.activities) {
      lines.push(`- ${item.name}${item.organization ? ` — ${item.organization}` : ''}${item.period ? ` (${item.period})` : ''}: ${item.description}`);
    }
  }

  return lines.join('\n');
}

/** Corta texto colado gigante antes de mandar para o modelo. */
export function trimForPrompt(value: string, maxChars: number): string {
  const clean = value.trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars)}\n[...texto truncado...]`;
}
