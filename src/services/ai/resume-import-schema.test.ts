import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extracaoSchema, paraConteudo } from './resume-import-schema';

/**
 * A transcrição de currículo importado.
 *
 * O QUE ESTES TESTES DEFENDEM: que o formato não deixe o modelo AFIRMAR nada
 * que o documento não disse. Esse é o defeito caro aqui, porque é silencioso —
 * um campo chutado chega bonito no formulário, a pessoa não revisa o que parece
 * certo, e o currículo sai afirmando algo que ela nunca escreveu.
 */

/** Extração mínima válida, para cada teste mexer só no que lhe interessa. */
function extrair(bruto: unknown) {
  return extracaoSchema.parse(bruto);
}

describe('extracaoSchema — o que o modelo não pode afirmar', () => {
  it('não aceita status de formação inventado: qualquer valor estranho vira vazio', () => {
    const { education } = extrair({
      education: [{ institution: 'UFBA', course: 'Administração', status: 'formado' }],
    });

    // "formado" não é um dos estados do domínio. Aceitar viraria um enum
    // paralelo; adivinhar o mais próximo ("concluido") seria o app afirmando
    // conclusão que o documento não declarou.
    assert.equal(education[0].status, '');
  });

  it('status ausente nasce vazio, e não "cursando"', () => {
    const { education } = extrair({
      education: [{ institution: 'IFBA', course: 'Informática', startDate: '2018', endDate: '2021' }],
    });

    // Um período que terminou NÃO é prova de curso concluído nem de trancamento.
    assert.equal(education[0].status, '');
  });

  it('emprego sem data final não é declarado como atual', () => {
    const { experiences } = extrair({
      experiences: [{ company: 'Mercado X', role: 'Vendedor', startDate: '2020' }],
    });

    assert.equal(experiences[0].current, false);
  });

  it('nível de idioma inventado cai para o mais baixo, nunca para o mais alto', () => {
    const { languages } = extrair({ languages: [{ name: 'Inglês', level: 'quase fluente' }] });

    // Errar para baixo é constrangimento numa entrevista; errar para cima é a
    // pessoa ser reprovada por afirmar fluência que o currículo dela não tinha.
    assert.equal(languages[0].level, 'basico');
  });
});

describe('extracaoSchema — tolerância a resposta malformada', () => {
  it('aceita lista devolvida como texto corrido, sem gastar uma segunda chamada', () => {
    const { experiences } = extrair({
      experiences: [{ company: 'Loja Y', role: 'Caixa', responsibilities: 'Atender clientes' }],
    });

    assert.deepEqual(experiences[0].responsibilities, ['Atender clientes']);
  });

  it('sobrevive a personal e goal ausentes por completo', () => {
    const extraido = extrair({});

    assert.equal(extraido.personal.fullName, '');
    assert.equal(extraido.goal.summary, '');
    assert.deepEqual(extraido.experiences, []);
  });

  it('objeto totalmente vazio ainda produz um currículo válido', () => {
    const conteudo = paraConteudo(extrair({}));

    assert.equal(conteudo.personal.fullName, '');
    assert.deepEqual(conteudo.experiences, []);
    assert.equal(conteudo.variant, 'geral');
  });
});

describe('paraConteudo — o que chega ao formulário', () => {
  it('descarta item sem conteúdo nenhum, para não abrir linha em branco', () => {
    const conteudo = paraConteudo(
      extrair({
        experiences: [
          { company: 'Padaria Z', role: 'Atendente' },
          { company: '', role: '', description: '' },
        ],
        skills: [{ name: 'Excel' }, { name: '   ' }],
      })
    );

    assert.equal(conteudo.experiences.length, 1);
    assert.equal(conteudo.experiences[0].company, 'Padaria Z');
    assert.equal(conteudo.skills.length, 1);
  });

  it('carimba id próprio em cada item, e nunca repetido', () => {
    const conteudo = paraConteudo(
      extrair({
        experiences: [
          { company: 'A', role: 'Um' },
          { company: 'B', role: 'Dois' },
          { company: 'C', role: 'Três' },
        ],
      })
    );

    const ids = conteudo.experiences.map((item) => item.id);
    // Id repetido quebra a lista do formulário de um jeito difícil de rastrear:
    // editar um item altera o outro.
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every((id) => id.length > 0));
  });

  it('preserva o texto como está, sem melhorar', () => {
    const conteudo = paraConteudo(
      extrair({ goal: { summary: 'trabalho com venda a 5 anos e gosto de atender pessoa' } })
    );

    // Corrigir aqui seria o app reescrevendo o currículo sem a pessoa pedir. A
    // melhoria é outra etapa do produto, e é escolha dela.
    assert.equal(conteudo.goal.summary, 'trabalho com venda a 5 anos e gosto de atender pessoa');
  });

  it('leva os avisos adiante, que é o que a pessoa precisa conferir primeiro', () => {
    const extraido = extrair({ warnings: ['Não consegui ler as datas da segunda experiência.'] });

    assert.deepEqual(extraido.warnings, ['Não consegui ler as datas da segunda experiência.']);
  });
});
