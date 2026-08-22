import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ResumeReview } from '@/types/ai';
import { toDelivery, toPreview } from './review-gate';

/**
 * O corte entre prévia e resultado completo.
 *
 * É o teste mais importante deste conjunto. Um erro aqui não quebra a tela nem
 * aparece em nenhum log: ele simplesmente entrega de graça o que deveria ser
 * pago, e ninguém percebe. O teste central é o último — ele varre o objeto
 * inteiro da prévia procurando qualquer pedaço do texto pago.
 */

const TEXTO_PAGO = 'RESUMO-REESCRITO-COMPLETO-QUE-NAO-PODE-VAZAR';

function analiseCompleta(): ResumeReview {
  return {
    score: 52,
    potentialScore: 78,
    dimensions: [
      { id: 'clareza', label: 'Clareza', score: 40, comment: 'Frases longas.' },
      { id: 'resumo', label: 'Resumo profissional', score: 20, comment: 'Sem resumo.' },
    ],
    strengths: ['forte 1', 'forte 2', 'forte 3', 'forte 4', 'forte 5'],
    weaknesses: ['fraco 1'],
    opportunities: ['oportunidade 1', 'oportunidade 2'],
    issues: [
      { where: 'A', problem: 'p1', fix: 'f1', severity: 'alta' },
      { where: 'B', problem: 'p2', fix: 'f2', severity: 'alta' },
      { where: 'C', problem: 'p3', fix: 'f3', severity: 'media' },
      { where: 'D', problem: 'PROBLEMA-OCULTO', fix: 'CORRECAO-OCULTA', severity: 'baixa' },
      { where: 'E', problem: 'PROBLEMA-OCULTO-2', fix: 'CORRECAO-OCULTA-2', severity: 'baixa' },
    ],
    recommendations: ['RECOMENDACAO-PAGA-1', 'RECOMENDACAO-PAGA-2'],
    keywords: { present: ['excel'], missing: ['sap'] },
    optimized: {
      summary: `${TEXTO_PAGO} `.repeat(20),
      experiences: [
        { id: 'e1', description: 'EXPERIENCIA-REESCRITA-1', responsibilities: [], achievements: [] },
        { id: 'e2', description: 'EXPERIENCIA-REESCRITA-2', responsibilities: [], achievements: [] },
      ],
      skillsOrder: ['excel'],
      notes: ['NOTA-PAGA'],
    },
  };
}

describe('toDelivery', () => {
  it('entrega tudo quando o paywall está desligado, mesmo no plano gratuito', () => {
    const entrega = toDelivery(analiseCompleta(), { plan: 'gratuito', paywallEnabled: false });
    assert.equal(entrega.access, 'completo');
  });

  it('entrega tudo para quem é pro', () => {
    const entrega = toDelivery(analiseCompleta(), { plan: 'pro', paywallEnabled: true });
    assert.equal(entrega.access, 'completo');
  });

  it('entrega só a prévia para o plano gratuito quando o paywall está ligado', () => {
    const entrega = toDelivery(analiseCompleta(), { plan: 'gratuito', paywallEnabled: true });
    assert.equal(entrega.access, 'previa');
  });
});

describe('toPreview', () => {
  it('mantém a nota e o potencial — é o que a prévia promete entregar', () => {
    const previa = toPreview(analiseCompleta());
    assert.equal(previa.score, 52);
    assert.equal(previa.potentialScore, 78);
  });

  it('mantém as dimensões inteiras: o diagnóstico não é o produto pago', () => {
    const previa = toPreview(analiseCompleta());
    assert.equal(previa.dimensions.length, 2);
  });

  it('mostra três problemas com a correção junto', () => {
    const previa = toPreview(analiseCompleta());
    assert.equal(previa.issues.length, 3);
    // Prévia sem a correção não ajudaria ninguém a decidir se vale pagar.
    assert.ok(previa.issues.every((issue) => issue.fix.length > 0));
  });

  it('conta corretamente o que ficou de fora, para o CTA ser específico', () => {
    const previa = toPreview(analiseCompleta());
    assert.equal(previa.hidden.issues, 2);
    assert.equal(previa.hidden.recommendations, 2);
    assert.equal(previa.hidden.rewrittenExperiences, 2);
    assert.equal(previa.hidden.opportunities, 2);
  });

  it('corta o resumo e sinaliza o corte', () => {
    const previa = toPreview(analiseCompleta());
    assert.ok(previa.summaryPreview.length < 200);
    assert.ok(previa.summaryPreview.endsWith('…'));
  });

  it('não estoura quando o resumo é mais curto que o limite', () => {
    const analise = analiseCompleta();
    analise.optimized.summary = 'Curto.';
    const previa = toPreview(analise);
    assert.equal(previa.summaryPreview, 'Curto.');
  });

  /**
   * A rede de segurança.
   *
   * Serializa a prévia inteira e procura cada marcador de conteúdo pago. Um
   * campo novo em `ResumeReview` que alguém espalhe na prévia por descuido cai
   * aqui, e não em produção.
   */
  it('não deixa vazar nenhum conteúdo pago em campo nenhum', () => {
    const serializada = JSON.stringify(toPreview(analiseCompleta()));

    for (const marcador of [
      'RECOMENDACAO-PAGA-1',
      'RECOMENDACAO-PAGA-2',
      'EXPERIENCIA-REESCRITA-1',
      'EXPERIENCIA-REESCRITA-2',
      'NOTA-PAGA',
      'PROBLEMA-OCULTO',
      'CORRECAO-OCULTA',
    ]) {
      assert.ok(
        !serializada.includes(marcador),
        `a prévia vazou conteúdo pago: ${marcador}`
      );
    }
  });

  it('deixa passar do resumo apenas o trecho cortado, nunca o texto inteiro', () => {
    const analise = analiseCompleta();
    const previa = toPreview(analise);
    assert.ok(analise.optimized.summary.length > previa.summaryPreview.length * 3);
    assert.ok(!JSON.stringify(previa).includes(analise.optimized.summary));
  });
});
