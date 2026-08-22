import 'server-only';

import { headers } from 'next/headers';
import { normalizeEmail } from './validation';

/**
 * Limite de tentativas nos pontos de autenticação.
 *
 * O QUE ISTO RESOLVE: sem nenhuma fricção, `signInAction` é um oráculo de senha
 * com throughput de rede. Força bruta contra uma conta e credential stuffing
 * (listas de e-mail e senha vazadas de outros serviços) são as duas formas mais
 * comuns de conta invadida, e nenhuma delas precisa de vulnerabilidade no
 * código — só de tentativas ilimitadas.
 *
 * LIMITAÇÃO QUE VOCÊ PRECISA CONHECER ANTES DE CONFIAR NISTO
 * ----------------------------------------------------------
 * O contador vive na MEMÓRIA DO PROCESSO. Num deploy com várias instâncias, ou
 * em plataforma serverless que cria processos sob demanda, cada instância tem o
 * próprio contador — e um atacante distribuído enfrenta o limite multiplicado
 * pelo número de instâncias, não o limite configurado.
 *
 * Foi escolhido assim conscientemente, e não por descuido:
 *
 *   - o driver `local` é de instância única por definição, e ali o limite vale
 *     integralmente;
 *   - no driver `supabase`, quem autentica é o Supabase Auth, que aplica o
 *     próprio limite por IP nos endpoints de senha, do lado do servidor deles.
 *     Esta camada é reforço, não a única barreira;
 *   - a alternativa correta para várias instâncias — contador em Redis, ou uma
 *     função `security definer` no Postgres — exige infraestrutura que este
 *     projeto ainda não tem, e um caminho `service_role` no servidor, que hoje
 *     não existe de propósito.
 *
 * Ao sair do plano de instância única, TROQUE `contar` por um contador
 * compartilhado. O resto deste arquivo não muda.
 */

interface Janela {
  /** Instantes das tentativas dentro da janela, em ms. */
  marcas: number[];
}

const contadores = new Map<string, Janela>();

/** Acima disto o mapa é podado, para o processo não crescer sem limite. */
const MAX_CHAVES = 10_000;

export interface Regra {
  /** Quantas tentativas cabem na janela. */
  limite: number;
  /** Tamanho da janela, em milissegundos. */
  janelaMs: number;
}

/**
 * As regras.
 *
 * Login por e-mail é o mais apertado: cinco erros seguidos numa mesma conta não
 * é gente distraída, é ataque. O limite por IP é folgado o bastante para não
 * derrubar um escritório inteiro atrás de um NAT, e apertado o bastante para
 * inviabilizar varredura de lista.
 */
export const REGRAS = {
  loginPorEmail: { limite: 5, janelaMs: 15 * 60_000 },
  loginPorIp: { limite: 30, janelaMs: 15 * 60_000 },
  cadastroPorIp: { limite: 10, janelaMs: 60 * 60_000 },
  recuperacaoPorEmail: { limite: 3, janelaMs: 60 * 60_000 },
  recuperacaoPorIp: { limite: 10, janelaMs: 60 * 60_000 },
  // Reenvio de confirmação tem os mesmos números da recuperação, e pela mesma
  // razão: as duas telas fazem um servidor de e-mail disparar mensagem para um
  // endereço que quem pede não precisa provar que é seu. Sem limite, viram
  // ferramenta de inundar a caixa de entrada alheia — e o remetente que aparece
  // é este produto, que é quem termina na lista de spam.
  confirmacaoPorEmail: { limite: 3, janelaMs: 60 * 60_000 },
  confirmacaoPorIp: { limite: 10, janelaMs: 60 * 60_000 },
} as const satisfies Record<string, Regra>;

/**
 * IP de quem está pedindo.
 *
 * `x-forwarded-for` pode ser forjado por qualquer cliente quando o app está
 * exposto direto na internet; atrás de um proxy sério (Vercel, Cloudflare), a
 * borda sobrescreve o cabeçalho e o primeiro endereço é confiável. Como o valor
 * só alimenta um contador — nunca uma decisão de autorização — o pior caso de
 * forja é o atacante escapar do próprio limite por IP, e ele ainda esbarra no
 * limite por e-mail, que não depende disto.
 */
async function enderecoDoPedido(): Promise<string> {
  const h = await headers();
  const encaminhado = h.get('x-forwarded-for');
  if (encaminhado) return encaminhado.split(',')[0]!.trim();
  return h.get('x-real-ip') ?? 'desconhecido';
}

function poda(agora: number): void {
  if (contadores.size <= MAX_CHAVES) return;
  for (const [chave, janela] of contadores) {
    if (janela.marcas.every((marca) => marca < agora - 60 * 60_000)) contadores.delete(chave);
  }
}

export interface Veredito {
  permitido: boolean;
  /** Em quantos segundos vale tentar de novo. Zero quando permitido. */
  esperarSegundos: number;
}

/**
 * Registra uma tentativa e diz se ela cabe na janela.
 *
 * Janela deslizante, e não balde por período fixo: com período fixo o atacante
 * gasta o limite no fim de um período e o limite inteiro de novo no começo do
 * seguinte, dobrando a taxa efetiva na virada.
 */
function contar(chave: string, regra: Regra): Veredito {
  const agora = Date.now();
  const inicio = agora - regra.janelaMs;

  const janela = contadores.get(chave) ?? { marcas: [] };
  janela.marcas = janela.marcas.filter((marca) => marca > inicio);

  if (janela.marcas.length >= regra.limite) {
    contadores.set(chave, janela);
    const maisAntiga = janela.marcas[0]!;
    return {
      permitido: false,
      esperarSegundos: Math.max(1, Math.ceil((maisAntiga + regra.janelaMs - agora) / 1000)),
    };
  }

  janela.marcas.push(agora);
  contadores.set(chave, janela);
  poda(agora);

  return { permitido: true, esperarSegundos: 0 };
}

/**
 * Verifica o limite contra um alvo JÁ RESOLVIDO.
 *
 * Separada de `verificarLimite` porque aquela lê `next/headers`, que só
 * existe dentro de uma requisição do Next. Com a regra isolada aqui, ela pode
 * ser exercitada por teste sem subir o framework — e a regra é justamente a
 * parte onde um erro não aparece em lugar nenhum até alguém ser invadido.
 */
export function verificarLimiteDe(operacao: keyof typeof REGRAS, alvo: string): Veredito {
  const limpo = alvo.trim();
  if (!limpo) return { permitido: true, esperarSegundos: 0 };
  return contar(`${operacao}:${limpo}`, REGRAS[operacao]);
}

/**
 * Verifica o limite de uma operação de autenticação.
 *
 * O identificador é normalizado e entra na chave; e-mail é sempre normalizado
 * para "Fulano@Exemplo.com " e "fulano@exemplo.com" não valerem como duas
 * contas diferentes na contagem.
 */
export async function verificarLimite(
  operacao: keyof typeof REGRAS,
  identificador?: string
): Promise<Veredito> {
  const alvo = operacao.endsWith('PorIp')
    ? await enderecoDoPedido()
    : normalizeEmail(identificador ?? '');

  return verificarLimiteDe(operacao, alvo);
}

/**
 * Zera o contador de um e-mail depois de um login bem-sucedido.
 *
 * Sem isto, quem erra a senha quatro vezes, acerta na quinta e sai, ficaria
 * bloqueado ao voltar minutos depois — punindo o dono da conta por um ataque
 * que não houve.
 */
export function limparLimite(operacao: keyof typeof REGRAS, identificador: string): void {
  contadores.delete(`${operacao}:${normalizeEmail(identificador)}`);
}

/** Mensagem única para todo bloqueio. Não diz se a conta existe. */
export function mensagemDeLimite(esperarSegundos: number): string {
  const minutos = Math.ceil(esperarSegundos / 60);
  return `Muitas tentativas seguidas. Aguarde ${minutos === 1 ? 'um minuto' : `${minutos} minutos`} e tente de novo.`;
}

/** Só para teste: descarta todo o estado acumulado. */
export function zerarContadores(): void {
  contadores.clear();
}
