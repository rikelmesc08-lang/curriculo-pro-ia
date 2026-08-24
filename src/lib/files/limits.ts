/**
 * Tetos de tamanho do arquivo enviado na importação.
 *
 * NUM ARQUIVO SÓ, E IMPORTADO PELOS DOIS LADOS. O cliente e o servidor já
 * tiveram números diferentes escritos à mão em cada lugar, e o custo disso é
 * silencioso: o cliente aprova um arquivo que o servidor vai recusar, e a
 * pessoa espera o upload inteiro para receber "arquivo grande demais".
 *
 * O NÚMERO NÃO SAIU DE UMA PREFERÊNCIA NOSSA — SAIU DA PLATAFORMA.
 * A Vercel corta o corpo de uma requisição em ~4,5 MB, e esse corte acontece
 * ANTES do nosso código: a função nem é chamada. O usuário vê um erro de rede
 * sem causa aparente, e não a nossa mensagem explicando o que fazer.
 *
 * O teto anterior de foto era 8 MB, ou seja, quase o dobro do que a plataforma
 * aceita. O caso concreto que isso quebrava:
 *
 *   1. iPhone fotografa o currículo impresso e grava em HEIC
 *   2. fora do Safari, o navegador não decodifica HEIC, então `reduzirImagem`
 *      devolve o arquivo original — comportamento deliberado, ver downscale.ts
 *   3. o arquivo de 6 MB passava na validação de 8 MB do cliente E do servidor
 *   4. e morria na borda da Vercel, com erro de rede
 *
 * Justamente a pessoa que o recurso existe para atender: a que só tem o
 * currículo no papel e o celular na mão.
 */

/** O que a plataforma aceita por requisição. Não é escolha nossa. */
export const PLATAFORMA_BYTES = Math.floor(4.5 * 1024 * 1024);

/**
 * Nosso teto, com folga para o que o `multipart/form-data` acrescenta.
 *
 * O envelope multipart soma fronteiras, cabeçalhos de parte e metadados ao
 * arquivo — a documentação do Next sugere contar 10 a 20 KB. A folga aqui é de
 * meio megabyte, larga de propósito: errar para baixo custa uma foto recusada
 * com mensagem clara, e errar para cima custa o erro de rede sem explicação.
 *
 * O MESMO TETO PARA PDF E PARA FOTO. Antes eram dois, porque foto é maior que
 * PDF — mas isso valia quando o teto era escolha nossa. O limite da plataforma
 * não distingue tipo de arquivo, então dois números só criariam a ilusão de que
 * foto tem mais espaço.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Alvo da redução no navegador, bem abaixo do teto.
 *
 * Não basta caber: a tela tem 60 segundos contando o tempo da IA, e 4 MB por
 * dados móveis consomem isso antes de o modelo começar a ler. Reduzir para
 * ~2 MB deixa margem para a rede ruim e ainda mantém o texto legível — 2200px
 * no maior lado é mais resolução que um A4 impresso a 200 dpi.
 */
export const ALVO_FOTO_BYTES = 2 * 1024 * 1024;

/** "3,4 MB" — para a mensagem dizer o tamanho na unidade que a pessoa lê. */
export function emMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/**
 * A recusa por tamanho, escrita para quem está do outro lado.
 *
 * Uma frase só, usada no cliente e no servidor, porque a pessoa pode bater nas
 * duas — e ler duas explicações diferentes para o mesmo problema é pior do que
 * ler uma ruim. Toda saída oferece o caminho alternativo: colar o texto não tem
 * limite de tamanho de arquivo nenhum.
 */
export function mensagemDeTamanho(bytes: number, ehFoto: boolean): string {
  const tamanho = emMegabytes(bytes);
  const teto = emMegabytes(MAX_UPLOAD_BYTES);

  return ehFoto
    ? `Sua foto tem ${tamanho} e o limite é ${teto}. Se ela veio de um iPhone, mande pelo Safari — lá o próprio navegador reduz a foto sozinho. Também funciona tirar de novo em resolução menor, ou colar o texto do currículo na outra aba.`
    : `Seu arquivo tem ${tamanho} e o limite é ${teto}. Salve o PDF em qualidade menor, ou cole o texto do currículo na outra aba.`;
}
