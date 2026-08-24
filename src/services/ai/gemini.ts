import 'server-only';

import { env } from '@/lib/env';
import { extractJson } from './json';
import { AiError, type AiProvider, type AiTask } from './provider';

/**
 * Provedor real, via API Gemini do Google.
 *
 * É o provedor PADRÃO do produto: o Gemini tem camada gratuita de verdade
 * (cota diária por chave, sem cartão), o que permite colocar o app no ar sem
 * comprar crédito de ninguém. Trocar por Anthropic, OpenAI ou qualquer outro é
 * escrever um arquivo como este e devolvê-lo em `getAiProvider()` — nada fora
 * desta pasta muda.
 *
 * POR QUE `fetch` E NÃO O SDK: a chamada é um POST com JSON. O SDK traria uma
 * dependência, um ciclo de atualização e um peso de bundle para embrulhar
 * quinze linhas. Menos dependência aqui também significa menos superfície onde
 * uma chave de API pode vazar por descuido de terceiro.
 *
 * A CHAVE NUNCA SAI DO SERVIDOR: este arquivo é `server-only`, é importado só
 * por `src/services/ai/index.ts`, e todo caminho até ele passa por Server
 * Action ou Route Handler. Não existe variável `NEXT_PUBLIC_` no projeto.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Prazo TOTAL de uma tarefa, somando todas as tentativas.
 *
 * É um prazo por tarefa, e não por requisição HTTP, e a diferença é o que
 * conserta um defeito real: uma tarefa pode fazer até quatro chamadas — a
 * original, a repetição por sobrecarga, a retentativa de formato, e a
 * repetição por sobrecarga dela. Com prazo por requisição, o pior caso somava
 * mais de três minutos, enquanto a plataforma corta a função em 60s. A pessoa
 * receberia o erro genérico da hospedagem, e o nosso tempo limite nunca
 * chegaria a disparar.
 *
 * CINQUENTA SEGUNDOS: as rotas que chamam IA declaram `maxDuration = 60`, teto
 * do plano gratuito da Vercel. A folga de 10s cobre o resto da requisição —
 * sessão, banco, serialização. Se você subir o `maxDuration` (planos pagos
 * permitem mais), suba este junto mantendo a folga.
 */
const TOTAL_BUDGET_MS = 50_000;

/** Espera antes de repetir uma chamada que caiu por sobrecarga do provedor. */
const OVERLOAD_RETRY_MS = 2_000;

/**
 * Abaixo disto não vale começar outra tentativa.
 *
 * Disparar uma requisição com 3 segundos de prazo só produz um erro de tempo
 * esgotado alguns segundos depois — gasta cota do provedor e atrasa a mensagem
 * que a pessoa vai ler de qualquer jeito.
 */
const MIN_TENTATIVA_MS = 8_000;

/** Quanto ainda resta do prazo da tarefa. */
function restante(prazo: number): number {
  return prazo - Date.now();
}

/**
 * Teto de saída.
 *
 * O dobro do que a tarefa pede, e nunca menos que 1024: os modelos da linha 2.5
 * gastam parte do orçamento "pensando" antes de escrever, e um teto justo faz a
 * resposta ser cortada no meio do JSON — que chega aqui como erro de formato,
 * sem pista nenhuma da causa real.
 */
function outputBudget(maxTokens: number): number {
  return Math.min(Math.max(maxTokens * 2, 1024), 8192);
}

interface GeminiPart {
  text?: string;
  /**
   * Arquivo embutido na própria requisição.
   *
   * O Gemini lê PDF nativamente — não há biblioteca de parsing neste projeto e
   * não precisa haver. `snake_case` é o nome que a API usa; não é deslize de
   * estilo.
   */
  inline_data?: { mime_type: string; data: string };
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; status?: string; message?: string };
}

function apiKey(): string {
  const key = env.geminiApiKey();
  if (!key) {
    throw new AiError(
      'configuracao',
      'cliente',
      'GEMINI_API_KEY não configurada.'
    );
  }
  return key;
}

/**
 * Traduz a falha HTTP para uma das categorias que a UI sabe exibir.
 *
 * O 429 é o caso que mais importa neste produto: é o limite da camada gratuita
 * do Gemini batendo, e o usuário precisa ler "tente daqui a pouco", não um
 * despejo de JSON de erro do Google.
 */
function errorFromStatus(status: number, body: GeminiResponse, task: string): AiError {
  const message = body.error?.message ?? `HTTP ${status}`;

  if (status === 400 && /api[ _-]?key/i.test(message)) {
    return new AiError('configuracao', task, 'Chave de API recusada pelo Google.');
  }
  if (status === 401 || status === 403) {
    return new AiError('configuracao', task, `Acesso negado pela API do Gemini: ${message}`);
  }
  if (status === 429) {
    return new AiError('limite', task, 'Cota da API do Gemini atingida.');
  }
  if (status === 404) {
    // Modelo aposentado ou nome errado em GEMINI_MODEL. Sem este caso, cai no
    // genérico de rede e a tela manda a pessoa "verificar a conexão" — conselho
    // inútil para um problema que só o dono do ambiente resolve.
    const modelo = env.geminiModel();
    return new AiError(
      'configuracao',
      task,
      `Modelo "${modelo}" não encontrado: ${message}`,
      `O modelo de IA configurado ("${modelo}") não está mais disponível. Ajuste GEMINI_MODEL nas variáveis de ambiente.`
    );
  }
  if (status === 400) {
    // Requisição malformada é bug nosso, não do usuário. Vai para o log com o
    // texto original; a tela recebe a mensagem genérica de formato.
    return new AiError('formato', task, `Requisição recusada pelo Gemini: ${message}`);
  }
  if (isOverload(status, message)) {
    // O genérico de rede mandaria a pessoa "verificar a conexão" — conselho
    // errado e irritante quando a conexão está ótima e quem está ocupado é o
    // Google. Acontece de verdade: durante os testes o gemini-3.7-flash devolveu
    // isto em uma de cada três chamadas.
    return new AiError(
      'rede',
      task,
      `Modelo sobrecarregado: ${message}`,
      'O modelo de IA está sobrecarregado neste momento. Isso costuma passar em alguns minutos — tente de novo.'
    );
  }
  return new AiError('rede', task, message);
}

function textOf(body: GeminiResponse, task: string): string {
  if (body.promptFeedback?.blockReason) {
    throw new AiError(
      'bloqueio',
      task,
      `Prompt bloqueado pelos filtros do Gemini: ${body.promptFeedback.blockReason}`
    );
  }

  const candidate = body.candidates?.[0];
  if (!candidate) {
    throw new AiError('formato', task, 'Resposta sem candidatos.');
  }
  if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'PROHIBITED_CONTENT') {
    throw new AiError('bloqueio', task, `Resposta bloqueada pelos filtros do Gemini.`);
  }
  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new AiError('formato', task, 'Resposta cortada por limite de tokens.');
  }

  return (candidate.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();
}

/** Sobrecarga do provedor é transitória por definição — vale uma segunda tentativa. */
function isOverload(status: number, message: string): boolean {
  return status === 503 || /high demand|overloaded|try again later/i.test(message);
}

async function callModel(
  task: AiTask<unknown>,
  prazo: number,
  correction?: string,
  jaRepetiu = false
): Promise<string> {
  const sobra = restante(prazo);
  if (sobra < MIN_TENTATIVA_MS) {
    throw new AiError(
      'rede',
      task.name,
      `Prazo da tarefa esgotado (${TOTAL_BUDGET_MS / 1000}s).`,
      'A IA demorou mais do que o limite desta tela. Tente de novo — se persistir, reduza o tamanho do texto colado.'
    );
  }

  /**
   * O ARQUIVO VEM ANTES DO TEXTO, e a ordem importa: o prompt manda extrair do
   * documento acima. Invertido, a instrução chega antes do que ela referencia.
   */
  const primeiraFala: GeminiPart[] = task.attachment
    ? [
        {
          inline_data: {
            mime_type: task.attachment.mimeType,
            data: task.attachment.dataBase64,
          },
        },
        { text: task.prompt },
      ]
    : [{ text: task.prompt }];

  const contents: { role: 'user' | 'model'; parts: GeminiPart[] }[] = [
    { role: 'user', parts: primeiraFala },
  ];

  if (correction) {
    contents.push({ role: 'model', parts: [{ text: correction.slice(0, 2000) }] });
    contents.push({
      role: 'user',
      parts: [
        {
          text: 'Sua resposta anterior não seguiu o formato pedido. Responda de novo com SOMENTE o objeto JSON válido, sem texto fora dele e sem bloco de código.',
        },
      ],
    });
  }

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${env.geminiModel()}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // No cabeçalho, e não como `?key=` na URL: query string vaza em log de
        // proxy, em Referer e em relatório de erro.
        'x-goog-api-key': apiKey(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: task.system }] },
        contents,
        generationConfig: {
          // Temperatura baixa: aqui o objetivo é fidelidade ao que a pessoa
          // escreveu, não criatividade. Criatividade, neste produto, é o nome
          // bonito de inventar experiência.
          temperature: 0.2,
          maxOutputTokens: outputBudget(task.maxTokens),
          // O modelo já devolve JSON puro. `extractJson` continua no caminho
          // como rede de segurança, não como expectativa.
          responseMimeType: 'application/json',
        },
      }),
      // O sinal usa o que RESTA do prazo da tarefa, não um valor fixo.
      signal: AbortSignal.timeout(sobra),
    });
  } catch (error) {
    if (error instanceof AiError) throw error;
    const aborted = (error as Error).name === 'TimeoutError' || (error as Error).name === 'AbortError';
    throw new AiError(
      'rede',
      task.name,
      aborted
        ? `Sem resposta do Gemini dentro do prazo de ${TOTAL_BUDGET_MS / 1000}s da tarefa.`
        : ((error as Error).message ?? 'Falha na chamada.'),
      aborted
        ? 'A IA demorou mais do que o limite desta tela. Tente de novo — se persistir, reduza o tamanho do texto colado.'
        : undefined
    );
  }

  let body: GeminiResponse;
  try {
    body = (await response.json()) as GeminiResponse;
  } catch {
    throw new AiError('formato', task.name, `Resposta ilegível do Gemini (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const erro = errorFromStatus(response.status, body, task.name);

    // "This model is currently experiencing high demand" é a resposta padrão do
    // Gemini num pico, e passa em segundos. Uma única repetição resolve o caso
    // comum sem transformar um provedor fora do ar numa espera interminável.
    if (
      !jaRepetiu &&
      isOverload(response.status, body.error?.message ?? '') &&
      // Só repete se ainda houver prazo para a repetição TER chance de terminar.
      restante(prazo) > OVERLOAD_RETRY_MS + MIN_TENTATIVA_MS
    ) {
      await new Promise((resolve) => setTimeout(resolve, OVERLOAD_RETRY_MS));
      return callModel(task, prazo, correction, true);
    }

    throw erro;
  }

  return textOf(body, task.name);
}

export const geminiProvider: AiProvider = {
  id: 'gemini',
  mode: 'real',

  async run<T>(task: AiTask<T>): Promise<T> {
    // O prazo nasce aqui e vale para a tarefa inteira, tentativas incluídas.
    const prazo = Date.now() + TOTAL_BUDGET_MS;

    const first = await callModel(task as AiTask<unknown>, prazo);

    const parsedFirst = task.schema.safeParse(extractJson(first));
    if (parsedFirst.success) return parsedFirst.data;

    // Uma segunda tentativa, e só uma: o erro mais comum é o modelo enfeitar a
    // resposta, e mostrar o texto de volta resolve. Insistir além disso queima
    // cota gratuita e tempo de quem está esperando com a tela em carregamento.
    const second = await callModel(task as AiTask<unknown>, prazo, first);
    const parsedSecond = task.schema.safeParse(extractJson(second));
    if (parsedSecond.success) return parsedSecond.data;

    throw new AiError(
      'formato',
      task.name,
      parsedSecond.error.issues[0]?.message ?? 'Formato inesperado.'
    );
  },
};
