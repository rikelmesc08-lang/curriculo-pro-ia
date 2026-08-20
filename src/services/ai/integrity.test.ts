import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { preserveAchievements, restoredNote } from './integrity';

/**
 * A trava contra perda de resultado.
 *
 * Nasceu de um caso real: com o modelo de verdade, uma experiência com dois
 * resultados informados voltou reescrita com um só — os dois tinham sido
 * condensados numa frase. Não é invenção, mas apaga do currículo algo que a
 * pessoa viveu, e ela pode aplicar a proposta sem notar a falta.
 */

const ORIGINAIS = [
  { id: 'a', achievements: ['reduzi o atraso de 5 para 1 dia', 'assumi a conciliação bancária'] },
  { id: 'b', achievements: [] },
  { id: 'c', achievements: ['destaque de atendimento do mês'] },
];

describe('preserveAchievements', () => {
  it('restaura os originais quando a reescrita devolve menos', () => {
    const { experiences, restored } = preserveAchievements(ORIGINAIS, [
      { id: 'a', achievements: ['reduzi prazos e assumi a conciliação'] },
    ]);

    assert.equal(restored, 1);
    assert.deepEqual(experiences[0].achievements, [
      'reduzi o atraso de 5 para 1 dia',
      'assumi a conciliação bancária',
    ]);
  });

  it('deixa passar a reescrita quando a quantidade se mantém', () => {
    const reescrito = ['Redução do prazo de lançamento de 5 para 1 dia', 'Assunção da conciliação bancária'];
    const { experiences, restored } = preserveAchievements(ORIGINAIS, [
      { id: 'a', achievements: reescrito },
    ]);

    assert.equal(restored, 0);
    assert.deepEqual(experiences[0].achievements, reescrito, 'o polimento da redação foi perdido à toa');
  });

  it('deixa passar quando a reescrita devolve mais itens', () => {
    // Desmembrar um resultado em dois é reorganizar, não apagar.
    const { experiences, restored } = preserveAchievements(ORIGINAIS, [
      { id: 'c', achievements: ['destaque do mês em março', 'destaque do mês em agosto'] },
    ]);
    assert.equal(restored, 0);
    assert.equal(experiences[0].achievements.length, 2);
  });

  it('não inventa resultado para quem não informou nenhum', () => {
    const { experiences, restored } = preserveAchievements(ORIGINAIS, [
      { id: 'b', achievements: [] },
    ]);
    assert.equal(restored, 0);
    assert.deepEqual(experiences[0].achievements, []);
  });

  it('não mexe em experiência cujo id não existe no currículo', () => {
    // Id inventado é descartado depois, na mesclagem por id. Aqui ele só passa
    // reto — a trava não é o lugar de decidir isso.
    const { experiences, restored } = preserveAchievements(ORIGINAIS, [
      { id: 'inventado', achievements: [] },
    ]);
    assert.equal(restored, 0);
    assert.equal(experiences[0].id, 'inventado');
  });

  it('preserva os demais campos da proposta', () => {
    const { experiences } = preserveAchievements(ORIGINAIS, [
      {
        id: 'a',
        description: 'texto reescrito',
        responsibilities: ['item novo'],
        achievements: ['condensado'],
      },
    ]);

    // Só `achievements` volta ao original; a reescrita do resto continua valendo.
    assert.equal(experiences[0].description, 'texto reescrito');
    assert.deepEqual(experiences[0].responsibilities, ['item novo']);
    assert.equal(experiences[0].achievements.length, 2);
  });

  it('conta cada experiência restaurada uma vez', () => {
    const { restored } = preserveAchievements(ORIGINAIS, [
      { id: 'a', achievements: [] },
      { id: 'b', achievements: [] },
      { id: 'c', achievements: [] },
    ]);
    // 'b' não tinha resultado nenhum, então não há o que restaurar nela.
    assert.equal(restored, 2);
  });

  it('não altera o array original recebido', () => {
    const originais = [{ id: 'a', achievements: ['um', 'dois'] }];
    preserveAchievements(originais, [{ id: 'a', achievements: [] }]);
    assert.deepEqual(originais[0].achievements, ['um', 'dois']);
  });

  it('devolve uma cópia, para o original não vazar por referência', () => {
    const originais = [{ id: 'a', achievements: ['um'] }];
    // `as string[]`: sem isso o TypeScript infere `never[]` da lista vazia e o
    // push abaixo nem compila.
    const { experiences } = preserveAchievements(originais, [
      { id: 'a', achievements: [] as string[] },
    ]);
    experiences[0].achievements.push('acrescentado depois');
    assert.deepEqual(originais[0].achievements, ['um']);
  });
});

describe('restoredNote', () => {
  it('usa singular para uma experiência', () => {
    assert.match(restoredNote(1), /Em uma experiência/);
  });

  it('usa plural com o número para mais de uma', () => {
    assert.match(restoredNote(3), /Em 3 experiências/);
  });
});
