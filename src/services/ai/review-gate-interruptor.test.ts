import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { ResumeReview } from '@/types/ai';

/**
 * O INTERRUPTOR DE VERDADE, não a variável booleana escrita à mão no teste.
 *
 * `review-gate.test.ts` já cobre `toDelivery` com `paywallEnabled: true/false`
 * passado diretamente — e isso testa a função pura, mas não testa a variável
 * de ambiente que vai ser virada no dia da primeira venda. Se alguém errar o
 * nome da env var, o valor esperado (`'on'` exato) ou a comparação em
 * `env.aiPaywallEnabled()`, aquele outro arquivo continua verde do mesmo jeito
 * — porque ele nunca lê `AI_PAYWALL` de verdade.
 *
 * Este arquivo liga os dois pontos: a env var crua e a decisão de entrega,
 * juntas, para as quatro combinações de plano × interruptor.
 */

const original = process.env.AI_PAYWALL;
afterEach(() => {
  if (original === undefined) delete process.env.AI_PAYWALL;
  else process.env.AI_PAYWALL = original;
});

function analiseMinima(): ResumeReview {
  return {
    score: 60,
    potentialScore: 85,
    dimensions: [],
    strengths: [],
    weaknesses: [],
    opportunities: [],
    issues: [],
    recommendations: ['SÓ-QUEM-PAGOU-VÊ-ISSO'],
    keywords: { present: [], missing: [] },
    optimized: { summary: 'resumo completo reescrito', experiences: [], skillsOrder: [], notes: [] },
  };
}

describe('env.aiPaywallEnabled — o valor cru da variável', () => {
  it('desligado por padrão, sem a variável definida', async () => {
    delete process.env.AI_PAYWALL;
    const { env } = await import('@/lib/env');
    assert.equal(env.aiPaywallEnabled(), false);
  });

  it('liga com "on", inclusive com espaço em volta (env de painel costuma vir assim)', async () => {
    const { env } = await import('@/lib/env');

    for (const valorCerto of ['on', ' on', 'on ', '  on  ']) {
      process.env.AI_PAYWALL = valorCerto;
      assert.equal(env.aiPaywallEnabled(), true, `"${valorCerto}" deveria ligar o paywall`);
    }
  });

  it('não liga com variação de caixa nem com sinônimo — só "on" (aparado) liga', async () => {
    const { env } = await import('@/lib/env');

    for (const valorErrado of ['On', 'ON', 'true', '1', 'yes', '']) {
      process.env.AI_PAYWALL = valorErrado;
      assert.equal(env.aiPaywallEnabled(), false, `"${valorErrado}" não deveria ligar o paywall`);
    }
  });
});

describe('o interruptor e a entrega, juntos: as quatro combinações', () => {
  it('AI_PAYWALL desligado: gratuito recebe a versão completa', async () => {
    delete process.env.AI_PAYWALL;
    const { env } = await import('@/lib/env');
    const { toDelivery } = await import('./review-gate');

    const entrega = toDelivery(analiseMinima(), { plan: 'gratuito', paywallEnabled: env.aiPaywallEnabled() });
    assert.equal(entrega.access, 'completo');
  });

  it('AI_PAYWALL desligado: pro também recebe a versão completa', async () => {
    delete process.env.AI_PAYWALL;
    const { env } = await import('@/lib/env');
    const { toDelivery } = await import('./review-gate');

    const entrega = toDelivery(analiseMinima(), { plan: 'pro', paywallEnabled: env.aiPaywallEnabled() });
    assert.equal(entrega.access, 'completo');
  });

  it('AI_PAYWALL=on: gratuito recebe só a prévia, sem o texto pago em lugar nenhum', async () => {
    process.env.AI_PAYWALL = 'on';
    const { env } = await import('@/lib/env');
    const { toDelivery } = await import('./review-gate');

    const entrega = toDelivery(analiseMinima(), { plan: 'gratuito', paywallEnabled: env.aiPaywallEnabled() });
    assert.equal(entrega.access, 'previa');
    assert.ok(!JSON.stringify(entrega).includes('SÓ-QUEM-PAGOU-VÊ-ISSO'));
  });

  it('AI_PAYWALL=on: pro recebe a versão completa', async () => {
    process.env.AI_PAYWALL = 'on';
    const { env } = await import('@/lib/env');
    const { toDelivery } = await import('./review-gate');

    const entrega = toDelivery(analiseMinima(), { plan: 'pro', paywallEnabled: env.aiPaywallEnabled() });
    assert.equal(entrega.access, 'completo');
    if (entrega.access === 'completo') {
      assert.ok(JSON.stringify(entrega).includes('SÓ-QUEM-PAGOU-VÊ-ISSO'));
    }
  });
});
