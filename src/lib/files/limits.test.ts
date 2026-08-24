import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  ALVO_FOTO_BYTES,
  MAX_UPLOAD_BYTES,
  PLATAFORMA_BYTES,
  emMegabytes,
  mensagemDeTamanho,
} from './limits';

/**
 * O defeito que estes testes existem para impedir NÃO É de lógica — é de
 * número desalinhado.
 *
 * O teto de foto já esteve em 8 MB contra um corte de plataforma de 4,5 MB. Não
 * havia teste falhando: cada arquivo estava certo sozinho, e a soma é que era
 * impossível. O sintoma chegava ao usuário como erro de rede sem causa, e só na
 * produção — porque em desenvolvimento não existe borda cortando requisição.
 */

describe('tetos de upload — a relação entre eles é o que importa', () => {
  it('o nosso teto cabe dentro do que a plataforma aceita', () => {
    assert.ok(
      MAX_UPLOAD_BYTES < PLATAFORMA_BYTES,
      `MAX_UPLOAD_BYTES (${MAX_UPLOAD_BYTES}) precisa ser menor que PLATAFORMA_BYTES (${PLATAFORMA_BYTES})`
    );
  });

  it('sobra folga para o envelope do multipart, e não só um fio', () => {
    // O `multipart/form-data` soma fronteiras, cabeçalhos de parte e metadados.
    // A documentação do Next sugere contar 10–20 KB; exigimos 100 KB de folga
    // para que um ajuste distraído no teto não encoste na borda.
    const folga = PLATAFORMA_BYTES - MAX_UPLOAD_BYTES;
    assert.ok(folga >= 100 * 1024, `folga de apenas ${folga} bytes`);
  });

  it('o alvo da redução no navegador fica abaixo do teto', () => {
    // Se o alvo fosse igual ao teto, uma foto reduzida "com sucesso" ainda
    // chegaria no limite, sem margem para o envelope nem para rede ruim.
    assert.ok(ALVO_FOTO_BYTES < MAX_UPLOAD_BYTES);
  });

  it('o bodySizeLimit do Next fica entre o nosso teto e o da plataforma', () => {
    // Lido do arquivo, e não importado: `next.config.ts` traz `NextConfig`, que
    // arrasta o mundo do Next para dentro do runner de teste.
    const config = readFileSync(new URL('../../../next.config.ts', import.meta.url), 'utf8');
    const achado = /bodySizeLimit:\s*'([\d.]+)mb'/.exec(config);

    assert.ok(achado, 'bodySizeLimit não encontrado em next.config.ts');

    const bytes = Number(achado[1]) * 1024 * 1024;
    assert.ok(
      bytes > MAX_UPLOAD_BYTES,
      'precisa ser MAIOR que o nosso teto, para quem recusar ser a nossa validação'
    );
    assert.ok(
      bytes <= PLATAFORMA_BYTES,
      'passar do corte da plataforma não compra nada: a borda corta antes'
    );
  });
});

describe('mensagemDeTamanho', () => {
  it('diz o tamanho do arquivo e o limite, os dois em MB', () => {
    const texto = mensagemDeTamanho(6 * 1024 * 1024, true);
    assert.match(texto, /6,0 MB/);
    assert.match(texto, /4,0 MB/);
  });

  it('a foto ganha a saída do Safari, que é o caso do iPhone', () => {
    // HEIC fora do Safari não é decodificado, então a foto sobe inteira. Mandar
    // "tire de novo menor" não resolve: o formato é que trava a redução.
    assert.match(mensagemDeTamanho(6 * 1024 * 1024, true), /Safari/);
  });

  it('o PDF não fala de Safari, que ali não tem nada a ver', () => {
    const texto = mensagemDeTamanho(6 * 1024 * 1024, false);
    assert.doesNotMatch(texto, /Safari/);
    assert.match(texto, /qualidade menor/);
  });

  it('toda recusa oferece colar o texto, que não tem limite de arquivo', () => {
    assert.match(mensagemDeTamanho(9e6, true), /colar o texto|cole o texto/);
    assert.match(mensagemDeTamanho(9e6, false), /colar o texto|cole o texto/);
  });
});

describe('emMegabytes', () => {
  it('usa vírgula, que é como se escreve número em português', () => {
    assert.equal(emMegabytes(1024 * 1024), '1,0 MB');
  });

  it('arredonda para uma casa', () => {
    assert.equal(emMegabytes(3.456 * 1024 * 1024), '3,5 MB');
  });
});
