import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptyEducation } from './draft';
import { parseResumeContent } from './schema';
import { buildSections } from './sections';
import { resumeToText } from '@/services/ai/prompts';
import { EDUCATION_STATUS, type Resume, type ResumeContent } from '@/types/resume';

/**
 * Formação nova não pode afirmar nada sobre a vida de quem preenche.
 *
 * O bug que originou estes testes foi encontrado testando o site publicado: o
 * resumo reescrito pela IA dizia "cursando Técnico em Informática" para um
 * curso concluído. A IA não inventou — o banco tinha mesmo `cursando`, porque
 * era o valor inicial de toda formação nova. Bastava preencher curso,
 * instituição e datas sem abrir o seletor.
 *
 * O dano é discreto e chega tarde: ninguém revisa um campo que já vem
 * preenchido, e a contradição só aparece na entrevista.
 *
 * O vazio se comporta de TRÊS formas diferentes, e cada uma tem seu teste
 * abaixo, porque errar qualquer uma reintroduz o problema por outro caminho:
 *   - no FORMULÁRIO, aparece como "Não informado" (a pessoa precisa ver a
 *     opção neutra para poder escolhê-la);
 *   - no CURRÍCULO, some (escrever "Não informado" é pior que nada);
 *   - no PROMPT, é omitido (mandar um campo vazio convida o modelo a
 *     preencher a lacuna sozinho).
 */
describe('status da formação', () => {
  // `parseResumeContent` exige `personal` e `goal` como objetos; só os campos
  // DENTRO deles têm padrão. Este atalho mantém os testes focados na formação.
  const comFormacao = (formacao: Record<string, unknown>) =>
    parseResumeContent({ personal: {}, goal: {}, education: [formacao] });

  // `resumeToText` recebe um `Resume` (o registro salvo), e não o `ResumeContent`
  // (só o conteúdo). Os campos de persistência não influenciam o prompt.
  const comoRegistro = (conteudo: ResumeContent): Resume => ({
    ...conteudo,
    id: 'r1',
    ownerId: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  it('formação nova nasce sem status', () => {
    assert.equal(
      emptyEducation().status,
      '',
      'um padrão que afirma algo põe na boca da pessoa uma informação que ela nunca deu'
    );
  });

  it('o schema aceita o vazio e não o troca por um palpite', () => {
    const conteudo = comFormacao({ id: 'f1', institution: 'SENAI', course: 'Técnico em Informática' });
    assert.equal(conteudo.education[0].status, '');
  });

  it('o schema preserva o status que a pessoa escolheu', () => {
    const conteudo = comFormacao({ id: 'f1', institution: 'SENAI', course: 'Técnico', status: 'concluido' });
    assert.equal(conteudo.education[0].status, 'concluido');
  });

  it('o seletor do formulário oferece a opção neutra em primeiro lugar', () => {
    assert.equal(EDUCATION_STATUS[0].id, '');
    assert.equal(EDUCATION_STATUS[0].label, 'Não informado');
  });

  it('no currículo, status vazio não vira texto nenhum', () => {
    const conteudo = comFormacao({ id: 'f1', institution: 'SENAI Piauí', course: 'Técnico em Informática' });
    const formacao = buildSections(conteudo).find((s) => s.id === 'formacao');
    assert.ok(formacao, 'a seção de formação deveria existir');
    const meta = formacao.kind === 'entries' ? formacao.entries[0].meta : '';
    assert.doesNotMatch(
      meta,
      /Não informado|Cursando/,
      `a folha não pode afirmar status nenhum; saiu: ${JSON.stringify(meta)}`
    );
  });

  it('no currículo, o status escolhido aparece', () => {
    const conteudo = comFormacao({ id: 'f1', institution: 'SENAI', course: 'Técnico', status: 'concluido' });
    const formacao = buildSections(conteudo).find((s) => s.id === 'formacao');
    const meta = formacao && formacao.kind === 'entries' ? formacao.entries[0].meta : '';
    assert.match(meta, /Concluído/);
  });
  it('no prompt, status vazio é omitido em vez de virar campo em branco', () => {
    const conteudo = comFormacao({
      id: 'f1',
      institution: 'SENAI Piauí',
      course: 'Técnico em Informática',
      degree: 'Técnico',
      startDate: '2017-02',
      endDate: '2018-12',
    });
    const texto = resumeToText(comoRegistro(conteudo));
    const linha = texto.split('\n').find((l) => l.includes('Técnico em Informática')) ?? '';

    assert.doesNotMatch(
      linha,
      /,\s*,/,
      `campo vazio entre vírgulas convida o modelo a preencher a lacuna; saiu: ${JSON.stringify(linha)}`
    );
    assert.doesNotMatch(linha, /cursando/i, 'o prompt não pode sugerir um status que ninguém informou');
    assert.match(linha, /SENAI Piauí/, 'o resto da formação continua no prompt');
  });

  it('no prompt, o status escolhido é enviado', () => {
    const conteudo = comFormacao({
      id: 'f1',
      institution: 'SENAI',
      course: 'Técnico em Informática',
      degree: 'Técnico',
      status: 'concluido',
    });
    const linha = resumeToText(comoRegistro(conteudo)).split('\n').find((l) => l.includes('Técnico em Informática')) ?? '';
    assert.match(linha, /concluido/);
  });
});
