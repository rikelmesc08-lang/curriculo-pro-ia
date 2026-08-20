import type {
  ResumeReview,
  ResumeReviewPreview,
  ReviewDelivery,
} from '@/types/ai';

/**
 * O corte entre a prévia gratuita e o resultado completo.
 *
 * ONDE ELE ACONTECE IMPORTA MAIS DO QUE COMO. Este módulo roda no servidor,
 * dentro da Server Action, ANTES de o resultado virar resposta. A alternativa
 * comum — mandar tudo para o navegador e esconder com CSS ou com um `if` no
 * componente — entrega o conteúdo pago para qualquer pessoa que abra as
 * ferramentas de desenvolvedor. Não é paywall, é cortina.
 *
 * A PRÉVIA É MONTADA CAMPO A CAMPO, nunca `{ ...review }` seguido de `delete`.
 * A diferença aparece no dia em que alguém acrescentar um campo novo a
 * `ResumeReview`: com espalha-e-poda, o campo novo vaza em silêncio; montando
 * campo a campo, ele simplesmente não entra, e o compilador cobra a decisão
 * consciente de incluí-lo.
 *
 * O QUE A PRÉVIA PRECISA SER: útil de verdade. Ela entrega a nota, as oito
 * dimensões medidas, os pontos fortes e os três problemas mais graves COM a
 * correção junto. Uma prévia que só mostra um número e um cadeado não ajuda
 * ninguém a decidir se vale pagar — e a pessoa do outro lado está procurando
 * emprego.
 */

/** Quantos problemas a prévia mostra por inteiro. */
const FREE_ISSUES = 3;

/** Quantos pontos fortes a prévia mostra. */
const FREE_STRENGTHS = 3;

/** Até onde vai o trecho do resumo reescrito. */
const SUMMARY_PREVIEW_CHARS = 180;

/**
 * Corta no fim de uma palavra, não no meio dela.
 *
 * Detalhe pequeno com efeito grande: "com experiência em atendiment…" faz o
 * corte parecer defeito. Cortar no espaço faz parecer o que é — uma prévia.
 */
function cutAtWord(text: string, limit: number): string {
  const clean = text.trim();
  if (clean.length <= limit) return clean;
  const slice = clean.slice(0, limit);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}

/** Monta a prévia a partir do resultado completo. Ver o comentário do módulo. */
export function toPreview(review: ResumeReview): ResumeReviewPreview {
  const issues = review.issues.slice(0, FREE_ISSUES);

  return {
    score: review.score,
    potentialScore: review.potentialScore,
    // As dimensões vão inteiras: são a medição, e é o que responde "como está
    // meu currículo". Cobrar pelo diagnóstico e não pela solução inverteria a
    // ordem do que tem valor aqui.
    dimensions: review.dimensions,
    strengths: review.strengths.slice(0, FREE_STRENGTHS),
    issues: issues.map((issue) => ({
      where: issue.where,
      problem: issue.problem,
      fix: issue.fix,
      severity: issue.severity,
    })),
    summaryPreview: cutAtWord(review.optimized.summary, SUMMARY_PREVIEW_CHARS),
    hidden: {
      issues: Math.max(review.issues.length - issues.length, 0),
      recommendations: review.recommendations.length,
      rewrittenExperiences: review.optimized.experiences.length,
      opportunities: review.opportunities.length,
    },
  };
}

/**
 * Decide o que este usuário recebe.
 *
 * `paywallEnabled` desligado entrega tudo a todo mundo, e é o padrão do
 * projeto: enquanto o checkout não existe, mostrar "desbloquear" seria pôr
 * cadeado numa porta sem chave. Ver `env.aiPaywallEnabled()`.
 */
export function toDelivery(
  review: ResumeReview,
  options: { plan: 'gratuito' | 'pro'; paywallEnabled: boolean }
): ReviewDelivery {
  if (!options.paywallEnabled || options.plan === 'pro') {
    return { access: 'completo', review };
  }
  return { access: 'previa', preview: toPreview(review) };
}
