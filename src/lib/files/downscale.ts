/**
 * Reduz uma foto antes de ela subir.
 *
 * POR QUE ISTO EXISTE: a foto de um currículo impresso sai de um celular com 3
 * a 6 MB. Subir isso por dados móveis leva dezenas de segundos, e a tela de
 * importação tem 60 segundos no total — contando o tempo da IA. Sem reduzir, a
 * pessoa que mais precisa do recurso (a que só tem o papel e o telefone) é
 * justamente a que vê "a IA demorou mais do que o limite desta tela".
 *
 * O TAMANHO NÃO PRECISA SER GRANDE PARA A LEITURA SER BOA. 2200px no maior lado
 * é mais resolução do que um A4 impresso a 200 dpi — o texto continua nítido
 * para o modelo, e o arquivo cai para uma fração do original.
 *
 * FALHAR AQUI NÃO É ERRO. Se o navegador não souber decodificar o formato — o
 * caso real é HEIC do iPhone fora do Safari —, devolvemos o arquivo original e
 * deixamos o servidor decidir. Uma foto grande que chega é infinitamente melhor
 * que uma conversão que aborta o envio.
 */

/** Maior lado, em pixels, depois da redução. */
const MAX_LADO = 2200;

/** Qualidade do JPEG resultante. Acima disso o ganho de tamanho some. */
const QUALIDADE = 0.85;

/** PDF passa direto: reduzir um PDF aqui significaria rasterizá-lo e perder o texto. */
function ehFoto(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  // Android às vezes manda `application/octet-stream` para foto da galeria.
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

export async function reduzirImagem(file: File): Promise<File> {
  if (!ehFoto(file)) return file;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const maiorLado = Math.max(bitmap.width, bitmap.height);

    // Já é pequena. Recodificar só perderia qualidade sem ganhar tamanho.
    if (maiorLado <= MAX_LADO) {
      bitmap.close();
      return file;
    }

    const escala = MAX_LADO / maiorLado;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);

    const contexto = canvas.getContext('2d');
    if (!contexto) {
      bitmap.close();
      return file;
    }

    contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', QUALIDADE);
    });

    // Sem blob, ou a "redução" ficou maior que o original: fica o original.
    if (!blob || blob.size >= file.size) return file;

    const nome = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], nome, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    // Formato que este navegador não decodifica. O servidor aceita o original.
    return file;
  }
}
