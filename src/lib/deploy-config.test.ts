import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * O `vercel.json` não é verificado por nada mais neste repositório: `npm run
 * build`, `tsc` e o lint não o abrem, e o CI passa inteiro com ele quebrado.
 * Quem o valida é a Vercel, já com o deploy em andamento — e a validação
 * acontece ANTES da build, então o deploy inteiro cai sem sequer compilar.
 *
 * Foi exatamente assim que o primeiro preview deste projeto morreu: o arquivo
 * trazia a explicação de cada opção numa chave `"//"`, o truque usual para
 * comentar JSON. A Vercel valida contra um schema fechado e recusou com
 * `should NOT have additional property "//"`. O comentário que existia para
 * ajudar quem lesse o arquivo foi o que impediu o projeto de subir.
 *
 * Daí a lista fechada abaixo. Ela não tenta reproduzir o schema da Vercel —
 * seria uma cópia desatualizada de algo que muda sem avisar. Ela afirma uma
 * coisa mais forte e mais útil: este arquivo só contém o que decidimos colocar
 * nele. Acrescentar uma chave legítima quebra o teste de propósito, para que a
 * mudança passe por uma leitura consciente do único arquivo do repositório que
 * ninguém mais confere.
 */
describe('vercel.json', () => {
  const bruto = readFileSync(join(process.cwd(), 'vercel.json'), 'utf8');

  it('é JSON válido', () => {
    assert.doesNotThrow(() => JSON.parse(bruto));
  });

  it('não tem chave de comentário, que a Vercel recusa', () => {
    const chaves = Object.keys(JSON.parse(bruto));
    // Pega `//`, `_comentario`, `#`: qualquer coisa que não seja opção real.
    const suspeitas = chaves.filter((c) => /^[^a-zA-Z$]/.test(c));
    assert.deepEqual(
      suspeitas,
      [],
      `chave(s) que a Vercel vai recusar: ${suspeitas.join(', ')}. ` +
        'JSON não aceita comentário; explique no README.'
    );
  });

  it('só contém as opções que decidimos definir', () => {
    const permitidas = new Set([
      '$schema',
      'regions',
      'installCommand',
      'framework',
    ]);
    const inesperadas = Object.keys(JSON.parse(bruto)).filter(
      (c) => !permitidas.has(c)
    );
    assert.deepEqual(
      inesperadas,
      [],
      `chave(s) nova(s) em vercel.json: ${inesperadas.join(', ')}. ` +
        'Se for intencional, some à lista deste teste e explique no README.'
    );
  });

  it('mantém a região em São Paulo, junto do banco', () => {
    const config = JSON.parse(bruto) as { regions?: string[] };
    assert.deepEqual(config.regions, ['gru1']);
  });

  it('instala com npm ci, respeitando o lockfile', () => {
    const config = JSON.parse(bruto) as { installCommand?: string };
    assert.equal(config.installCommand, 'npm ci');
  });
});
