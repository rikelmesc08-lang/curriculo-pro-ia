/**
 * Descobre o tipo de um arquivo pelos primeiros bytes.
 *
 * POR QUE NÃO CONFIAR NO `type` DO ARQUIVO: aquele campo é DECLARADO por quem
 * envia, não verificado por ninguém. Renomear qualquer coisa para `.pdf` faz o
 * navegador anunciar `application/pdf` sem que um único byte do arquivo seja
 * PDF. Conferir a assinatura é o que separa "o cliente afirmou" de "o arquivo
 * é".
 *
 * O QUE ISTO NÃO É: uma checagem de segurança suficiente sozinha. Um PDF pode
 * ser um PDF de verdade e ainda assim ser malicioso. O que protege aqui é o
 * resto do desenho — o arquivo nunca é executado, nunca é gravado em disco,
 * nunca é servido de volta e nunca é aberto por nós. Ele vira base64, vai para
 * a API do modelo e sai da memória. A assinatura serve para recusar cedo o que
 * o modelo não conseguiria ler de qualquer jeito, com uma mensagem útil.
 */

/** Os tipos que o Gemini lê como documento ou imagem. */
export type TipoAceito =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/heic'
  | 'image/heif';

/** Compara uma sequência de bytes numa posição. */
function bateEm(bytes: Uint8Array, offset: number, esperado: number[]): boolean {
  if (bytes.length < offset + esperado.length) return false;
  return esperado.every((valor, indice) => bytes[offset + indice] === valor);
}

/** Lê 4 bytes como texto ASCII — usado nos contêineres que se identificam por palavra. */
function palavraEm(bytes: Uint8Array, offset: number): string {
  if (bytes.length < offset + 4) return '';
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

/**
 * Marcas de HEIC/HEIF.
 *
 * O formato é um contêiner ISO-BMFF: os quatro bytes em 4 dizem `ftyp` e a
 * "marca" em 8 diz qual variante é. São várias porque a Apple grava marcas
 * diferentes conforme o modo da câmera — foto solta, sequência, HDR — e recusar
 * uma delas seria recusar o iPhone de alguém sem explicação nenhuma.
 */
const MARCAS_HEIF = new Set([
  'heic',
  'heix',
  'heim',
  'heis',
  'hevc',
  'hevx',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
]);

/**
 * O tipo real do arquivo, ou `null` se não for nenhum dos aceitos.
 *
 * Devolver o tipo DETECTADO, e não o declarado, é o ponto: é este valor que
 * segue para a API do modelo. Mandar `application/pdf` para uma foto faria o
 * modelo recusar com um erro que não diz nada a quem enviou.
 */
export function detectarTipo(bytes: Uint8Array): TipoAceito | null {
  // %PDF-
  if (bateEm(bytes, 0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';

  // JPEG começa com FF D8 FF e é o caso mais comum de foto.
  if (bateEm(bytes, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';

  // PNG tem assinatura de 8 bytes, incluindo quebras de linha que detectam
  // corrupção por transferência em modo texto.
  if (bateEm(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';

  // WEBP é um contêiner RIFF: "RIFF" em 0, tamanho, e "WEBP" em 8.
  if (palavraEm(bytes, 0) === 'RIFF' && palavraEm(bytes, 8) === 'WEBP') return 'image/webp';

  // HEIC/HEIF: "ftyp" em 4, marca em 8.
  if (palavraEm(bytes, 4) === 'ftyp') {
    const marca = palavraEm(bytes, 8);
    if (MARCAS_HEIF.has(marca)) {
      // `mif1`/`msf1` são marcas genéricas de HEIF; as demais são HEIC. Na
      // prática o Gemini aceita os dois, e a distinção só existe para o
      // cabeçalho sair honesto.
      return marca === 'mif1' || marca === 'msf1' ? 'image/heif' : 'image/heic';
    }
  }

  return null;
}

/** Um documento é foto? Muda o limite de tamanho e o texto que a pessoa lê. */
export function ehImagem(tipo: TipoAceito): boolean {
  return tipo !== 'application/pdf';
}
