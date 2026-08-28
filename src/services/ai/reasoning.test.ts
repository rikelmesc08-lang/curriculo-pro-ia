import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * Quais tarefas de IA abrem mão do raciocínio do modelo — e quais NÃO podem.
 *
 * MEDIÇÃO QUE ORIGINOU ISTO (28/08/2026, PDF real de 23 KB, gemini-3.6-flash):
 * a importação gastava 2.500 tokens de pensamento para escrever 931 de
 * resposta, e levava 20,1s. Com `reasoning: 'minimal'` foram 6,0s, zero tokens
 * de pensamento, e o JSON extraído saiu IDÊNTICO campo por campo. A tela tem
 * orçamento de 50s e a pessoa estava batendo nele.
 *
 * O RISCO QUE ESTES TESTES EXISTEM PARA IMPEDIR é a generalização. Ver "3× mais
 * rápido, mesmo resultado" convida a espalhar `reasoning: 'minimal'` por todas
 * as tarefas — e aí o ganho vira prejuízo, porque as outras não são
 * transcrição. Analisar um currículo, comparar com uma vaga, reescrever um
 * texto, preparar perguntas de entrevista: nessas, o raciocínio É o trabalho, e
 * cortá-lo troca segundos pela qualidade que a pessoa está pagando para
 * receber. A diferença não é de grau, é de natureza da tarefa.
 *
 * Os testes leem o FONTE em vez de importar os módulos porque `resume-import.ts`
 * e `resume-ai.ts` abrem com `import 'server-only'`, que não carrega no runner.
 * É o mesmo recurso que `files/limits.test.ts` já usa para ler o
 * `next.config.mjs`.
 */

function fonte(arquivo: string): string {
  return readFileSync(new URL(`./${arquivo}`, import.meta.url), 'utf8');
}

/** O bloco de declaração de uma tarefa, do `name:` até o `demo:`. */
function blocoDaTarefa(codigo: string, nome: string): string {
  const inicio = codigo.indexOf(`name: '${nome}'`);
  assert.notEqual(inicio, -1, `tarefa "${nome}" não encontrada`);
  const fim = codigo.indexOf('demo:', inicio);
  assert.notEqual(fim, -1, `tarefa "${nome}" sem campo demo — a busca não delimitou o bloco`);
  return codigo.slice(inicio, fim);
}

describe('transcrição abre mão do raciocínio', () => {
  const codigo = fonte('resume-import.ts');

  for (const tarefa of ['importResume', 'importResumeText']) {
    it(`${tarefa} declara reasoning: 'minimal'`, () => {
      assert.match(
        blocoDaTarefa(codigo, tarefa),
        /reasoning:\s*'minimal'/,
        `${tarefa} voltou a pensar antes de transcrever — 3× mais lento, sem ganho medido`
      );
    });
  }
});

describe('tarefas de julgamento continuam pensando', () => {
  /**
   * Estas são o produto. Se alguma aparecer com `reasoning: 'minimal'`, ou foi
   * descuido, ou foi uma decisão que precisa de medição de QUALIDADE por trás —
   * e não só de tempo. Neste caso, meça a saída e reescreva este teste com o
   * que você mediu; não o apague.
   */
  const DE_JULGAMENTO = [
    'reviewResume',
    'analyzeAts',
    'analyzeJobDescription',
    'matchResumeToJob',
    'optimizeResume',
    'generateCoverLetter',
    'generateInterviewQuestions',
    'generateRecruiterMessage',
    'improveExperience',
    'improveProfessionalSummary',
  ];

  const codigo = fonte('resume-ai.ts');

  for (const tarefa of DE_JULGAMENTO) {
    it(`${tarefa} NÃO abre mão do raciocínio`, () => {
      assert.doesNotMatch(
        blocoDaTarefa(codigo, tarefa),
        /reasoning:\s*'minimal'/,
        `${tarefa} é tarefa de julgamento: cortar o raciocínio troca qualidade por segundos`
      );
    });
  }

  it('a lista acima cobre todas as tarefas de resume-ai.ts', () => {
    // Sem isto, uma tarefa nova entra no arquivo sem ninguém decidir a que
    // grupo ela pertence — e passa despercebida justamente por ser nova.
    const declaradas = [...codigo.matchAll(/name: '([a-zA-Z]+)'/g)].map((m) => m[1]);
    const faltando = declaradas.filter((nome) => !DE_JULGAMENTO.includes(nome));
    assert.deepEqual(
      faltando,
      [],
      `tarefas sem classificação: ${faltando.join(', ')}. Decida se são transcrição ou julgamento.`
    );
  });
});
