import type { ReviewIssue } from '@/types/ai';
import type { ResumeSection } from './sections';

/**
 * Liga cada problema apontado pela análise ao lugar do currículo onde ele será
 * marcado no PDF de diagnóstico.
 *
 * A REGRA QUE GOVERNA ESTE ARQUIVO: marca no lugar errado é pior que marca
 * nenhuma. Uma marca vermelha ao lado de um trecho manda a pessoa reescrever
 * aquele trecho. Se o endereço veio errado do modelo, ela reescreve o que
 * estava bom e deixa o defeito de pé — e ainda perde a confiança no diagnóstico
 * inteiro.
 *
 * Por isso o endereço DEGRADA em vez de chutar:
 *
 *   endereço bom            → marca na entrada exata
 *   seção certa, item errado → marca a seção inteira (é o que sabemos de fato)
 *   seção inexistente        → nenhuma marca; o problema vai para "não
 *                              localizados", e a pessoa lê o texto e decide
 *
 * NENHUM PROBLEMA É DESCARTADO em nenhum caminho. O que se perde quando o
 * endereço falha é só a marca no corpo do documento, nunca o achado.
 */

export interface IssueMark {
  /** Número impresso no documento. 1-based, na ordem em que a análise devolveu. */
  number: number;
  issue: ReviewIssue;
  /** Seção onde a marca pousa. Ausente quando não foi possível localizar. */
  sectionId?: string;
  /** Posição da entrada dentro da seção, quando a marca é de um item só. */
  entryIndex?: number;
}

export interface MarkPlan {
  /** Todos os problemas, numerados, na ordem original. Nada some daqui. */
  all: IssueMark[];
  /** Marcas de seção inteira, indexadas por `id` da seção. */
  bySection: Map<string, IssueMark[]>;
  /** Marcas de uma entrada, indexadas por `${sectionId}#${entryIndex}`. */
  byEntry: Map<string, IssueMark[]>;
  /** Problemas sem endereço utilizável. Aparecem na lista, sem marca no corpo. */
  unplaced: IssueMark[];
}

/** Chave composta usada pelo renderizador para achar as marcas de uma entrada. */
export function entryKey(sectionId: string, entryIndex: number): string {
  return `${sectionId}#${entryIndex}`;
}

function push<K>(map: Map<K, IssueMark[]>, key: K, mark: IssueMark): void {
  const atual = map.get(key);
  if (atual) atual.push(mark);
  else map.set(key, [mark]);
}

export function resolveIssueMarks(sections: ResumeSection[], issues: ReviewIssue[]): MarkPlan {
  const plan: MarkPlan = {
    all: [],
    bySection: new Map(),
    byEntry: new Map(),
    unplaced: [],
  };

  for (const [indice, issue] of issues.entries()) {
    const mark: IssueMark = { number: indice + 1, issue };
    plan.all.push(mark);

    const anchor = issue.anchor;
    const section = anchor ? sections.find((item) => item.id === anchor.section) : undefined;

    // Sem endereço, ou apontando para uma seção que este currículo não tem —
    // o modelo pode citar "projetos" num currículo sem projetos.
    if (!anchor || !section) {
      plan.unplaced.push(mark);
      continue;
    }

    mark.sectionId = section.id;

    // Endereço de item só faz sentido em seção de entradas. Num parágrafo ou
    // numa lista em linha, a seção inteira É o alvo.
    if (!anchor.entryId || section.kind !== 'entries') {
      push(plan.bySection, section.id, mark);
      continue;
    }

    const entryIndex = section.entries.findIndex((entry) => entry.sourceId === anchor.entryId);

    // Item que não existe: o modelo inventou o id ou copiou de outro currículo.
    // A seção continua sendo verdade, então a marca sobe um nível em vez de
    // sumir — e em vez de pousar numa entrada arbitrária.
    if (entryIndex === -1) {
      push(plan.bySection, section.id, mark);
      continue;
    }

    mark.entryIndex = entryIndex;
    push(plan.byEntry, entryKey(section.id, entryIndex), mark);
  }

  return plan;
}

/** Cor da marca por gravidade. Usada no PDF e na legenda, de uma fonte só. */
export const SEVERITY_COLORS: Record<ReviewIssue['severity'], { mark: string; tint: string; label: string }> = {
  alta: { mark: '#b91c1c', tint: '#fef2f2', label: 'Grave' },
  media: { mark: '#b45309', tint: '#fffbeb', label: 'Médio' },
  baixa: { mark: '#1d4ed8', tint: '#eff6ff', label: 'Leve' },
};

/**
 * A gravidade que manda numa marca com mais de um problema.
 *
 * Duas ressalvas leves e uma grave no mesmo trecho: o trecho é grave. Pintar
 * pela média esconderia o defeito sério atrás dos pequenos.
 */
export function dominantSeverity(marks: IssueMark[]): ReviewIssue['severity'] {
  if (marks.some((mark) => mark.issue.severity === 'alta')) return 'alta';
  if (marks.some((mark) => mark.issue.severity === 'media')) return 'media';
  return 'baixa';
}
