/**
 * Tetos de tamanho do arquivo enviado na importação.
 *
 * NUM ARQUIVO SÓ, E IMPORTADO PELOS DOIS LADOS. O cliente e o servidor já
 * tiveram números diferentes escritos à mão em cada lugar, e o custo disso é
 * silencioso: o cliente aprova um arquivo que o servidor vai recusar, e a
 * pessoa espera o upload inteiro para receber "arquivo grande demais".
 *
 * O NÚMERO NÃO SAIU DE UMA PREFERÊNCIA NOSSA — SAIU DA PLATAFORMA.
 * E A PLATAFORMA MUDOU EM 27/08/2026, então o número mudou junto. O histórico
 * inteiro fica aqui porque ele já se inverteu uma vez e pode se inverter de
 * novo: o que manda é QUEM está na frente do nosso código, não este arquivo.
 *
 * FASE 1 — Vercel, teto de 4 MB. A borda da Vercel cortava o corpo da
 * requisição em ~4,5 MB, ANTES de a função ser chamada. O teto de foto era de
 * 8 MB, quase o dobro do que chegava, e o caso concreto que isso quebrava:
 *
 *   1. iPhone fotografa o currículo impresso e grava em HEIC
 *   2. fora do Safari, o navegador não decodifica HEIC, então `reduzirImagem`
 *      devolve o arquivo original — comportamento deliberado, ver downscale.ts
 *   3. o arquivo de 6 MB passava na validação de 8 MB do cliente E do servidor
 *   4. e morria na borda da Vercel, com erro de rede
 *
 * Justamente a pessoa que o recurso existe para atender: a que só tem o
 * currículo no papel e o celular na mão. Por isso o teto caiu para 4 MB.
 *
 * FASE 2 — Hostinger, teto de volta a 8 MB. Com a produção servida pelo Web App
 * Node.js da Hostinger, a borda que cortava em 4,5 MB SAIU DO CAMINHO, e com
 * ela o motivo do 4 MB. Isto não é dedução a partir do painel: em 28/08/2026 a
 * produção recebeu corpos de 1, 2, 3, 4, 5, 6, 8, 12 e 20 MB em POST, e as nove
 * respostas foram o 413 do NOSSO código, nenhuma um 413 de borda. Ou seja, 20 MB
 * atravessam o proxy inteiros. O `client_max_body_size` do Nginx — cujo padrão
 * de fábrica é 1 MB, e que `next.config.mjs` documentava como risco em aberto —
 * NÃO está no padrão neste host.
 *
 * O caso do HEIC de 6 MB, que a fase 1 só conseguia recusar com uma mensagem
 * educada, agora passa.
 */

/**
 * O que a plataforma aceita por requisição. Não é escolha nossa.
 *
 * QUEM APERTA AQUI NÃO É MAIS A BORDA HTTP — É O PROVEDOR DE IA. Sem o corte da
 * Vercel, o proxy da Hostinger passa 20 MB sem reclamar (medido, ver o histórico
 * no topo do arquivo), e o gargalo passou a ser o outro lado do caminho: o
 * arquivo sai daqui para o Gemini como `inline_data` em base64
 * (`src/server/actions/ai.ts`, `src/services/ai/gemini.ts`), e a API dele aceita
 * ~20 MB de requisição INTEIRA. Base64 infla o arquivo em 4/3, e ainda somam o
 * prompt e o envelope JSON — então o teto real de ARQUIVO é 20 ÷ 4/3 = 15 MB,
 * com o resto da requisição saindo dessa mesma conta.
 *
 * Continua valendo a regra que dá nome à constante: se um dia o arquivo for
 * enviado ao provedor por referência em vez de embutido, este número volta a
 * ser o da borda HTTP, e é ESTE comentário que precisa mudar primeiro.
 */
export const PLATAFORMA_BYTES = 15 * 1024 * 1024;

/**
 * Nosso teto, com folga para o que o `multipart/form-data` acrescenta.
 *
 * O envelope multipart soma fronteiras, cabeçalhos de parte e metadados ao
 * arquivo — a documentação do Next sugere contar 10 a 20 KB. A folga que
 * importa é a que separa este número do `bodySizeLimit` de `next.config.mjs`,
 * porque é o `bodySizeLimit` que mede o corpo INTEIRO, com envelope e tudo:
 * meio megabyte, larga de propósito. Errar para baixo custa uma foto recusada
 * com mensagem clara; errar para cima custa o erro genérico do Next, sem
 * explicação.
 *
 * OITO MEGABYTES, E NÃO OS QUINZE QUE O PROVEDOR AINDA ACEITARIA. A distância
 * até `PLATAFORMA_BYTES` é deliberada, por duas razões que a borda não cobre:
 * o arquivo é lido inteiro para a memória e depois copiado em base64 (mais 4/3
 * do tamanho) dentro de um JSON, e isso roda num VPS pequeno, não numa função
 * elástica; e 15 MB por dados móveis é uma espera que ninguém atravessa. Oito
 * cobre o caso que motivou a mudança — o HEIC de 6 MB — com margem, e o resto
 * é espaço que só seria gasto em acidente.
 *
 * O MESMO TETO PARA PDF E PARA FOTO. Antes eram dois, porque foto é maior que
 * PDF. Manter um só continua certo pelo motivo de sempre: nada no caminho —
 * nem o proxy, nem o Next, nem o provedor de IA — distingue tipo de arquivo,
 * então dois números só criariam a ilusão de que foto tem mais espaço.
 */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Alvo da redução no navegador, bem abaixo do teto.
 *
 * NÃO SOBE JUNTO COM O TETO, e é de propósito. Este número nunca foi sobre o
 * que cabe — é sobre o que a pessoa aguenta esperar. Reduzir para ~2 MB deixa
 * margem para a rede ruim e ainda mantém o texto legível: 2200px no maior lado
 * é mais resolução que um A4 impresso a 200 dpi, e o modelo não lê melhor com
 * mais pixels. Subir o teto para 8 MB não é um convite a MANDAR 8 MB; é o que
 * fazer quando o navegador não consegue reduzir (HEIC fora do Safari, ver
 * downscale.ts), que é o único caminho por onde um arquivo grande deveria
 * passar.
 *
 * A justificativa antiga citava os 60 segundos de `maxDuration` como o que
 * estourava. Esse corte era da Vercel e não existe no servidor próprio; o
 * prazo que sobrou (50 s, em `gemini.ts`) é POR TAREFA DE IA e só começa a
 * contar depois de o upload inteiro ter chegado. Upload lento hoje faz a pessoa
 * esperar — não faz mais a requisição morrer.
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
