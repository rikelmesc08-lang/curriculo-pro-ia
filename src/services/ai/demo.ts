import 'server-only';

import type { AiProvider, AiTask } from './provider';

/**
 * Modo demonstração.
 *
 * NÃO chama modelo nenhum. Executa a função `demo()` que cada tarefa carrega —
 * uma transformação determinística sobre o que o próprio usuário digitou
 * (reordenar, cruzar palavras, contar, formatar).
 *
 * O QUE ELE NUNCA FAZ, e por que isso está escrito aqui: fingir. Toda resposta
 * volta com `mode: 'demo'`, e a UI carimba um aviso visível em cima do
 * resultado. Um produto que mostra texto pré-programado com cara de IA está
 * mentindo para o usuário — e, num app de currículo, mentindo para alguém que
 * vai levar aquele texto para uma entrevista.
 *
 * O atraso artificial existe para que os estados de carregamento sejam
 * exercitados de verdade durante o desenvolvimento, em vez de piscarem.
 */

const DEMO_LATENCY_MS = 450;

export const demoProvider: AiProvider = {
  id: 'demo',
  mode: 'demo',

  async run<T>(task: AiTask<T>): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, DEMO_LATENCY_MS));
    return task.demo();
  },
};
