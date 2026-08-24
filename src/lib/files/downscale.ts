import { ALVO_FOTO_BYTES } from './limits';

/**
 * Reduz uma foto antes de ela subir.
 *
 * POR QUE ISTO EXISTE: a foto de um currículo impresso sai de um celular com 3
 * a 6 MB. Isso é maior que o teto de requisição da plataforma (ver
 * `limits.ts`), e mesmo quando cabe, subir por dados móveis leva dezenas de
 * segundos — a tela de importação tem 60 segundos no total, contando o tempo da
 * IA. Sem reduzir, a pessoa que mais precisa do recurso (a que só tem o papel e
 * o telefone) é justamente a que vê o erro.
 *
 * O TAMANHO NÃO PRECISA SER GRANDE PARA A LEITURA SER BOA. 2200px no maior lado
 * é mais resolução do que um A4 impresso a 200 dpi — o texto continua nítido
 * para o modelo, e o arquivo cai para uma fração do original.
 *
 * REDUZIR UMA VEZ NÃO BASTA, e era esse o furo da versão anterior: ela só agia
 * quando a imagem passava de 2200px e aceitava qualquer tamanho que saísse
 * dali. Uma foto de 2000px em PNG, ou uma câmera que grava com pouca
 * compressão, atravessava intacta com vários megabytes. Agora a redução
 * PERSEGUE UM ALVO EM BYTES: tenta, mede, e aperta de novo enquanto não couber.
 *
 * FALHAR AQUI CONTINUA NÃO SENDO ERRO. Se o navegador não souber decodificar o
 * formato — o caso real é HEIC do iPhone fora do Safari —, devolvemos o arquivo
 * original e deixamos a validação decidir. Uma foto grande que chega e é
 * recusada com mensagem clara é melhor que uma conversão que aborta o envio.
 */

/** Tentativas, da melhor qualidade para a mais apertada. */
const TENTATIVAS: { lado: number; qualidade: number }[] = [
  { lado: 2200, qualidade: 0.85 },
  { lado: 2000, qualidade: 0.75 },
  { lado: 1700, qualidade: 0.65 },
  { lado: 1400, qualidade: 0.6 },
];

/** PDF passa direto: reduzir um PDF aqui significaria rasterizá-lo e perder o texto. */
function ehFoto(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  // Android às vezes manda `application/octet-stream` para foto da galeria.
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

/** Desenha o bitmap num lado máximo e devolve o JPEG resultante. */
async function reencodar(
  bitmap: ImageBitmap,
  ladoMaximo: number,
  qualidade: number
): Promise<Blob | null> {
  const maiorLado = Math.max(bitmap.width, bitmap.height);
  // Nunca AUMENTA a imagem: uma foto pequena reamostrada para cima fica maior
  // em bytes e pior de ler.
  const escala = Math.min(1, ladoMaximo / maiorLado);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));

  const contexto = canvas.getContext('2d');
  if (!contexto) return null;

  contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', qualidade);
  });
}

export async function reduzirImagem(file: File): Promise<File> {
  if (!ehFoto(file)) return file;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Formato que este navegador não decodifica. O servidor recebe o original e
    // a validação de tamanho decide — com mensagem que explica o que fazer.
    return file;
  }

  try {
    // Já pequena o bastante E dentro do alvo: recodificar só perderia qualidade.
    if (file.size <= ALVO_FOTO_BYTES && Math.max(bitmap.width, bitmap.height) <= TENTATIVAS[0].lado) {
      return file;
    }

    let melhor: Blob | null = null;

    for (const tentativa of TENTATIVAS) {
      const blob = await reencodar(bitmap, tentativa.lado, tentativa.qualidade);
      if (!blob) continue;

      // Guarda a menor versão vista, para não voltar de mãos vazias caso
      // nenhuma tentativa alcance o alvo.
      if (!melhor || blob.size < melhor.size) melhor = blob;

      if (blob.size <= ALVO_FOTO_BYTES) break;
    }

    // Sem blob, ou a "redução" ficou maior que o original: fica o original.
    if (!melhor || melhor.size >= file.size) return file;

    const nome = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([melhor], nome, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    // Libera a memória do bitmap em qualquer desfecho. Sem isto, importar
    // várias fotos seguidas na mesma aba acumula imagens decodificadas.
    bitmap.close();
  }
}
