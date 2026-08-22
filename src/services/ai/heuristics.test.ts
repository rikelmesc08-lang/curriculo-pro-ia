import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EXAMPLE_RESUME } from '@/lib/resume/example';
import { normalizeForCompare } from '@/lib/utils';
import type { Resume } from '@/types/resume';
import { heuristicReview, potentialFrom } from './heuristics';

/**
 * A análise medida.
 *
 * É o que o modo demonstração devolve e a base do prompt da versão com IA. Duas
 * propriedades precisam valer sempre, e nenhuma delas é visível olhando a tela:
 *
 *   1. REPRODUTIBILIDADE — a mesma entrada dá a mesma nota. Nota que muda a cada
 *      clique destrói a confiança da pessoa no indicador.
 *   2. INTEGRIDADE — nenhum resultado, número ou competência aparece na saída
 *      sem ter entrado. É a promessa central do produto, e é a que um
 *      refatoramento distraído quebra sem dar erro nenhum.
 */

function curriculo(patch: Partial<Resume> = {}): Resume {
  return {
    ...EXAMPLE_RESUME,
    id: 'r1',
    ownerId: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

const VAGA =
  'Vaga: Assistente Administrativo. Requisitos: Excel intermediário, emissão de notas fiscais, ' +
  'organização de arquivos, atendimento ao cliente e rotina de contas a pagar. Desejável SAP.';

describe('heuristicReview', () => {
  it('devolve exatamente as oito dimensões, sempre nos mesmos ids', () => {
    const analise = heuristicReview(curriculo(), VAGA);
    assert.deepEqual(
      analise.dimensions.map((dimension) => dimension.id).sort(),
      ['ats', 'clareza', 'erros', 'experiencias', 'habilidades', 'organizacao', 'palavras-chave', 'resumo']
    );
  });

  it('é reproduzível: mesma entrada, mesma saída', () => {
    const primeira = heuristicReview(curriculo(), VAGA);
    const segunda = heuristicReview(curriculo(), VAGA);
    assert.deepEqual(primeira, segunda);
  });

  it('mantém score e potentialScore dentro de 0 a 100', () => {
    for (const entrada of [curriculo(), curriculo({ experiences: [], skills: [] })]) {
      const analise = heuristicReview(entrada, VAGA);
      assert.ok(analise.score >= 0 && analise.score <= 100);
      assert.ok(analise.potentialScore >= 0 && analise.potentialScore <= 100);
      assert.ok(analise.dimensions.every((d) => d.score >= 0 && d.score <= 100));
    }
  });

  it('nunca promete um potencial menor que a nota atual', () => {
    const analise = heuristicReview(curriculo(), VAGA);
    assert.ok(analise.potentialScore >= analise.score);
  });

  it('funciona sem vaga informada', () => {
    const analise = heuristicReview(curriculo(), '');
    assert.equal(analise.dimensions.length, 8);
    assert.deepEqual(analise.keywords.missing, []);
  });

  it('aponta os campos essenciais que estão em branco', () => {
    const vazio = curriculo({
      personal: { ...EXAMPLE_RESUME.personal, email: '', phone: '' },
    });
    const dimensao = heuristicReview(vazio, VAGA).dimensions.find((d) => d.id === 'erros');
    assert.ok(dimensao);
    assert.match(dimensao.comment, /e-mail/);
    assert.match(dimensao.comment, /telefone/);
    assert.ok(dimensao.score < 100);
  });

  it('todo problema apontado vem com uma correção', () => {
    const fraco = curriculo({ experiences: [], skills: [], education: [] });
    const analise = heuristicReview(fraco, VAGA);
    assert.ok(analise.issues.length > 0, 'currículo vazio tem que gerar problemas');
    assert.ok(analise.issues.every((issue) => issue.fix.trim().length > 0));
  });

  it('ordena os problemas do mais grave para o menos grave', () => {
    const analise = heuristicReview(curriculo({ experiences: [], skills: [] }), VAGA);
    const pesos = { alta: 0, media: 1, baixa: 2 };
    const sequencia = analise.issues.map((issue) => pesos[issue.severity]);
    assert.deepEqual(sequencia, [...sequencia].sort((a, b) => a - b));
  });

  // --- Integridade ---------------------------------------------------------

  it('não inventa resultado em experiência que não tinha nenhum', () => {
    const semResultados = curriculo({
      experiences: EXAMPLE_RESUME.experiences.map((experience) => ({
        ...experience,
        achievements: [],
      })),
    });
    const analise = heuristicReview(semResultados, VAGA);
    assert.ok(
      analise.optimized.experiences.every((experience) => experience.achievements.length === 0),
      'a versão otimizada criou um resultado que a pessoa não informou'
    );
  });

  it('não acrescenta competência que não estava cadastrada', () => {
    const analise = heuristicReview(curriculo(), VAGA);
    const cadastradas = new Set(EXAMPLE_RESUME.skills.map((skill) => skill.name));
    for (const nome of analise.optimized.skillsOrder) {
      assert.ok(cadastradas.has(nome), `competência inventada: ${nome}`);
    }
    assert.equal(analise.optimized.skillsOrder.length, EXAMPLE_RESUME.skills.length);
  });

  it('mantém o id de cada experiência, para a mesclagem poder casá-las', () => {
    const analise = heuristicReview(curriculo(), VAGA);
    assert.deepEqual(
      analise.optimized.experiences.map((experience) => experience.id),
      EXAMPLE_RESUME.experiences.map((experience) => experience.id)
    );
  });

  it('não escreve resumo profissional do zero quando não existe nenhum', () => {
    const semResumo = curriculo({ goal: { ...EXAMPLE_RESUME.goal, summary: '' } });
    assert.equal(heuristicReview(semResumo, VAGA).optimized.summary, '');
  });

  it('só marca como presente termo que realmente está no currículo', () => {
    const analise = heuristicReview(curriculo(), VAGA);
    // A comparação passa pela mesma normalização que a medição usa (acento e
    // caixa fora). Comparar com o texto cru daria falso negativo em
    // "emissão de notas" — que ESTÁ no currículo, escrito com acento.
    const texto = normalizeForCompare(JSON.stringify(EXAMPLE_RESUME));
    for (const termo of analise.keywords.present) {
      assert.ok(
        texto.includes(normalizeForCompare(termo)),
        `marcou como presente algo ausente: ${termo}`
      );
    }
  });

  it('não classifica o mesmo termo como presente e ausente ao mesmo tempo', () => {
    const analise = heuristicReview(curriculo(), VAGA);
    const presentes = new Set(analise.keywords.present);
    for (const termo of analise.keywords.missing) {
      assert.ok(!presentes.has(termo), `termo em duas listas: ${termo}`);
    }
  });
});

describe('potentialFrom', () => {
  it('eleva a 85 só o que está abaixo de 70', () => {
    // [40, 90] → [85, 90] → média 87,5 → 88
    assert.equal(potentialFrom([40, 90]), 88);
  });

  it('não mexe no que já está bom', () => {
    assert.equal(potentialFrom([80, 90]), 85);
  });

  it('devolve 0 para lista vazia em vez de NaN', () => {
    assert.equal(potentialFrom([]), 0);
  });

  it('é sempre maior ou igual à média atual', () => {
    for (const notas of [[10, 20, 30], [95, 99], [0], [70, 70, 70]]) {
      const atual = notas.reduce((total, nota) => total + nota, 0) / notas.length;
      assert.ok(potentialFrom(notas) >= Math.floor(atual));
    }
  });
});
