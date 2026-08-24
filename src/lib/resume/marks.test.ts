import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ReviewIssue } from '@/types/ai';
import type { ResumeSection } from './sections';
import { dominantSeverity, entryKey, resolveIssueMarks, type IssueMark } from './marks';

/**
 * O que estes testes protegem: a MARCA NUNCA PODE POUSAR NO LUGAR ERRADO.
 *
 * O endereço de cada problema vem de um modelo de linguagem, que erra id,
 * inventa seção e às vezes não responde o campo. Cada um desses casos tem um
 * desfecho definido aqui — e nenhum deles é "marca a primeira entrada e torce".
 */

const SECOES: ResumeSection[] = [
  { id: 'resumo', title: 'Resumo profissional', kind: 'paragraph', paragraph: 'Texto do resumo.' },
  {
    id: 'experiencia',
    title: 'Experiência profissional',
    kind: 'entries',
    entries: [
      { sourceId: 'exp-1', title: 'Vendedora', subtitle: 'Farmácia', meta: '2022', bullets: [] },
      { sourceId: 'exp-2', title: 'Vendedora', subtitle: 'Loja', meta: '2021', bullets: [] },
    ],
  },
  { id: 'idiomas', title: 'Idiomas', kind: 'inline', items: ['Inglês — Avançado'] },
];

function problema(parcial: Partial<ReviewIssue>): ReviewIssue {
  return {
    where: 'algum lugar',
    problem: 'algo está errado',
    fix: 'faça assim',
    severity: 'media',
    ...parcial,
  };
}

describe('resolveIssueMarks — endereço bom', () => {
  it('marca a entrada exata quando o id existe', () => {
    const plano = resolveIssueMarks(SECOES, [
      problema({ anchor: { section: 'experiencia', entryId: 'exp-2' } }),
    ]);

    const marcas = plano.byEntry.get(entryKey('experiencia', 1));
    assert.equal(marcas?.length, 1);
    assert.equal(marcas?.[0].entryIndex, 1);
    assert.equal(plano.unplaced.length, 0);
  });

  it('não confunde duas experiências com o mesmo cargo', () => {
    const plano = resolveIssueMarks(SECOES, [
      problema({ anchor: { section: 'experiencia', entryId: 'exp-1' } }),
    ]);

    // As duas entradas se chamam "Vendedora". Casar por título pegaria a
    // primeira sempre; casar por id pega a certa.
    assert.ok(plano.byEntry.has(entryKey('experiencia', 0)));
    assert.ok(!plano.byEntry.has(entryKey('experiencia', 1)));
  });

  it('marca a seção inteira quando o problema não é de um item só', () => {
    const plano = resolveIssueMarks(SECOES, [problema({ anchor: { section: 'resumo' } })]);

    assert.equal(plano.bySection.get('resumo')?.length, 1);
    assert.equal(plano.unplaced.length, 0);
  });
});

describe('resolveIssueMarks — endereço ruim degrada, nunca chuta', () => {
  it('item inexistente vira marca da seção, e não de outra entrada', () => {
    const plano = resolveIssueMarks(SECOES, [
      problema({ anchor: { section: 'experiencia', entryId: 'id-que-nao-existe' } }),
    ]);

    assert.equal(plano.bySection.get('experiencia')?.length, 1);
    assert.equal(plano.byEntry.size, 0, 'nenhuma entrada pode ser marcada por engano');
  });

  it('seção que este currículo não tem não produz marca nenhuma', () => {
    const plano = resolveIssueMarks(SECOES, [
      problema({ anchor: { section: 'projetos', entryId: 'proj-1' } }),
    ]);

    assert.equal(plano.unplaced.length, 1);
    assert.equal(plano.bySection.size, 0);
    assert.equal(plano.byEntry.size, 0);
  });

  it('problema sem endereço nenhum continua na lista, sem marca', () => {
    const plano = resolveIssueMarks(SECOES, [problema({})]);

    assert.equal(plano.unplaced.length, 1);
    assert.equal(plano.all.length, 1);
    assert.equal(plano.bySection.size, 0);
  });

  it('id de item numa seção que não tem entradas marca a seção', () => {
    // "idiomas" é lista em linha: não há entrada para pousar.
    const plano = resolveIssueMarks(SECOES, [
      problema({ anchor: { section: 'idiomas', entryId: 'seja-o-que-for' } }),
    ]);

    assert.equal(plano.bySection.get('idiomas')?.length, 1);
    assert.equal(plano.byEntry.size, 0);
  });
});

describe('resolveIssueMarks — numeração', () => {
  it('numera na ordem recebida, e o número não depende de ter endereço', () => {
    const plano = resolveIssueMarks(SECOES, [
      problema({}), // sem endereço
      problema({ anchor: { section: 'resumo' } }),
      problema({ anchor: { section: 'experiencia', entryId: 'exp-1' } }),
    ]);

    assert.deepEqual(
      plano.all.map((marca) => marca.number),
      [1, 2, 3]
    );
    assert.equal(plano.unplaced[0].number, 1, 'o não localizado mantém o número dele');
    assert.equal(plano.bySection.get('resumo')?.[0].number, 2);
    assert.equal(plano.byEntry.get(entryKey('experiencia', 0))?.[0].number, 3);
  });

  it('nenhum problema some, qualquer que seja o endereço', () => {
    const entrada = [
      problema({ anchor: { section: 'nao-existe' } }),
      problema({ anchor: { section: 'experiencia', entryId: 'exp-1' } }),
      problema({}),
      problema({ anchor: { section: 'resumo' } }),
    ];

    const plano = resolveIssueMarks(SECOES, entrada);

    assert.equal(plano.all.length, entrada.length);
  });

  it('acumula mais de um problema na mesma entrada', () => {
    const plano = resolveIssueMarks(SECOES, [
      problema({ anchor: { section: 'experiencia', entryId: 'exp-1' } }),
      problema({ anchor: { section: 'experiencia', entryId: 'exp-1' } }),
    ]);

    assert.equal(plano.byEntry.get(entryKey('experiencia', 0))?.length, 2);
  });
});

describe('dominantSeverity', () => {
  function marca(severity: ReviewIssue['severity']): IssueMark {
    return { number: 1, issue: problema({ severity }) };
  }

  it('uma grave no meio de leves manda no trecho', () => {
    assert.equal(dominantSeverity([marca('baixa'), marca('alta'), marca('baixa')]), 'alta');
  });

  it('média ganha de leve', () => {
    assert.equal(dominantSeverity([marca('baixa'), marca('media')]), 'media');
  });

  it('só leves continua leve', () => {
    assert.equal(dominantSeverity([marca('baixa'), marca('baixa')]), 'baixa');
  });
});
