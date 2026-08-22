import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectarTipo, ehImagem } from './sniff';

/**
 * A identificação do arquivo enviado.
 *
 * O QUE ESTES TESTES DEFENDEM: que a decisão venha dos BYTES, e nunca do que o
 * navegador declarou. O `type` de um arquivo é dito por quem envia — renomear
 * qualquer coisa para `.pdf` já faz o campo dizer `application/pdf`.
 *
 * O caso do HEIC tem teste próprio porque é o formato padrão da câmera do
 * iPhone: errar nele é recusar a foto de metade das pessoas sem explicar por
 * quê, e o defeito só aparece com um iPhone na mão.
 */

/** Monta um arquivo falso com a assinatura pedida e lixo depois. */
function arquivo(...prefixo: number[]): Uint8Array {
  return new Uint8Array([...prefixo, ...new Array(32).fill(0x41)]);
}

/** Bytes de uma palavra ASCII de 4 letras. */
function palavra(texto: string): number[] {
  return [...texto].map((letra) => letra.charCodeAt(0));
}

describe('detectarTipo — formatos aceitos', () => {
  it('reconhece PDF pela marca %PDF-', () => {
    assert.equal(detectarTipo(arquivo(0x25, 0x50, 0x44, 0x46, 0x2d)), 'application/pdf');
  });

  it('reconhece JPEG, que é o formato da maioria das fotos', () => {
    assert.equal(detectarTipo(arquivo(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg');
  });

  it('reconhece PNG pela assinatura completa de 8 bytes', () => {
    assert.equal(
      detectarTipo(arquivo(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
      'image/png'
    );
  });

  it('reconhece WEBP, que exige as duas palavras do contêiner RIFF', () => {
    const bytes = new Uint8Array([
      ...palavra('RIFF'),
      0x00,
      0x00,
      0x00,
      0x00,
      ...palavra('WEBP'),
      ...new Array(16).fill(0),
    ]);
    assert.equal(detectarTipo(bytes), 'image/webp');
  });

  it('reconhece HEIC do iPhone em todas as marcas que a câmera grava', () => {
    for (const marca of ['heic', 'heix', 'hevc', 'heim']) {
      const bytes = new Uint8Array([
        0x00,
        0x00,
        0x00,
        0x18,
        ...palavra('ftyp'),
        ...palavra(marca),
        ...new Array(16).fill(0),
      ]);
      assert.equal(detectarTipo(bytes), 'image/heic', `marca ${marca}`);
    }
  });

  it('trata as marcas genéricas mif1 e msf1 como HEIF', () => {
    const bytes = new Uint8Array([
      0x00,
      0x00,
      0x00,
      0x18,
      ...palavra('ftyp'),
      ...palavra('mif1'),
      ...new Array(16).fill(0),
    ]);
    assert.equal(detectarTipo(bytes), 'image/heif');
  });
});

describe('detectarTipo — o que precisa ser recusado', () => {
  it('recusa arquivo renomeado: extensão não é assinatura', () => {
    // Um executável do Windows começa com "MZ". Se chegasse como
    // `curriculo.pdf`, o navegador anunciaria application/pdf sem hesitar.
    assert.equal(detectarTipo(arquivo(0x4d, 0x5a, 0x90, 0x00)), null);
  });

  it('recusa texto puro, que não é documento nem imagem', () => {
    assert.equal(detectarTipo(new Uint8Array(palavra('Olá,'))), null);
  });

  it('recusa contêiner ISO-BMFF que não seja HEIF — mp4 não é foto', () => {
    const bytes = new Uint8Array([
      0x00,
      0x00,
      0x00,
      0x18,
      ...palavra('ftyp'),
      ...palavra('mp42'),
      ...new Array(16).fill(0),
    ]);
    assert.equal(detectarTipo(bytes), null);
  });

  it('recusa RIFF que não é WEBP — um .wav também começa com RIFF', () => {
    const bytes = new Uint8Array([
      ...palavra('RIFF'),
      0x00,
      0x00,
      0x00,
      0x00,
      ...palavra('WAVE'),
      ...new Array(16).fill(0),
    ]);
    assert.equal(detectarTipo(bytes), null);
  });

  it('não estoura com arquivo curto demais para ter assinatura', () => {
    assert.equal(detectarTipo(new Uint8Array([0x25])), null);
    assert.equal(detectarTipo(new Uint8Array([])), null);
  });
});

describe('ehImagem', () => {
  it('separa foto de documento, que é o que muda o limite de tamanho', () => {
    assert.equal(ehImagem('application/pdf'), false);
    assert.equal(ehImagem('image/jpeg'), true);
    assert.equal(ehImagem('image/heic'), true);
  });
});
