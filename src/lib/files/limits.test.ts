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

/**
 * O `bodySizeLimit` lido do arquivo, e não importado: importar executaria o
 * config inteiro, e o que interessa aqui é só o número declarado nele.
 */
function bodySizeLimitBytes(): number {
  const config = readFileSync(new URL('../../../next.config.mjs', import.meta.url), 'utf8');
  const achado = /bodySizeLimit:\s*'([\d.]+)mb'/.exec(config);
  assert.ok(achado, 'bodySizeLimit não encontrado em next.config.mjs');
  return Number(achado[1]) * 1024 * 1024;
}

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
    //
    // A COMPARAÇÃO É CONTRA O `bodySizeLimit`, E NÃO CONTRA `PLATAFORMA_BYTES`.
    // Quem mede o corpo inteiro — arquivo MAIS envelope — é o Next, neste
    // campo; a nossa validação mede só o arquivo. Enquanto a plataforma era a
    // borda da Vercel os dois números ficavam colados e a distinção não
    // aparecia. Hoje `PLATAFORMA_BYTES` é o teto do provedor de IA, quase o
    // dobro do nosso, e comparar contra ele passaria sempre — um teste que não
    // pode falhar não protege nada.
    const folga = bodySizeLimitBytes() - MAX_UPLOAD_BYTES;
    assert.ok(folga >= 100 * 1024, `folga de apenas ${folga} bytes`);
  });

  it('o alvo da redução no navegador fica abaixo do teto', () => {
    // Se o alvo fosse igual ao teto, uma foto reduzida "com sucesso" ainda
    // chegaria no limite, sem margem para o envelope nem para rede ruim.
    assert.ok(ALVO_FOTO_BYTES < MAX_UPLOAD_BYTES);
  });

  it('o bodySizeLimit do Next fica entre o nosso teto e o da plataforma', () => {
    const bytes = bodySizeLimitBytes();
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
  // NOVE MEGABYTES, E NÃO SEIS. Estes casos precisam ser arquivos que a
  // validação DE FATO recusa; 6 MB era recusado quando o teto era 4 MB e hoje
  // passa. Um teste de mensagem de recusa montado sobre um arquivo aceito
  // continuaria verde para sempre sem descrever nada que aconteça.
  it('diz o tamanho do arquivo e o limite, os dois em MB', () => {
    const texto = mensagemDeTamanho(9 * 1024 * 1024, true);
    assert.match(texto, /9,0 MB/);
    assert.match(texto, /8,0 MB/);
  });

  it('a foto ganha a saída do Safari, que é o caso do iPhone', () => {
    // HEIC fora do Safari não é decodificado, então a foto sobe inteira. Mandar
    // "tire de novo menor" não resolve: o formato é que trava a redução.
    assert.match(mensagemDeTamanho(9 * 1024 * 1024, true), /Safari/);
  });

  it('o PDF não fala de Safari, que ali não tem nada a ver', () => {
    const texto = mensagemDeTamanho(9 * 1024 * 1024, false);
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
