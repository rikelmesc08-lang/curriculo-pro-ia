/**
 * Travas de integridade aplicadas sobre a saída do modelo.
 *
 * A regra do produto é que a IA REORGANIZA E MELHORA o que a pessoa escreveu.
 * "Não inventar" já estava garantido em código — experiências casadas por `id`,
 * competências só reordenadas. Faltava o outro lado da mesma regra: **não
 * apagar**.
 *
 * OBSERVADO COM O MODELO REAL: numa experiência com dois resultados informados,
 * a versão reescrita voltou com um só. O modelo tinha condensado os dois numa
 * frase. Não é invenção, mas é perda — some do currículo um resultado que a
 * pessoa viveu e escreveu, e ela pode aplicar a proposta sem notar.
 */

interface ComResultados {
  id: string;
  achievements: string[];
}

export interface PreservacaoResultado<T> {
  experiences: T[];
  /** Quantas experiências tiveram os resultados originais restaurados. */
  restored: number;
}

/**
 * Garante que a reescrita nunca devolva menos resultados do que entrou.
 *
 * A REGRA É DE CONTAGEM, e a escolha quando ela é violada é deliberada:
 * restaura a lista original INTEIRA, descartando a reescrita daquele campo.
 *
 * Por que não misturar — reaproveitar a reescrita e só acrescentar o que
 * sumiu: não há como saber quais originais foram condensados em qual frase
 * nova. Acrescentar todos duplicaria o conteúdo; acrescentar por semelhança
 * seria adivinhação. Entre perder o polimento da redação e perder um resultado
 * real do currículo de alguém, perder o polimento é o erro barato.
 *
 * Reescrita que devolve a MESMA quantidade passa intacta — que é o caso comum.
 */
export function preserveAchievements<T extends ComResultados>(
  originals: ComResultados[],
  proposed: T[]
): PreservacaoResultado<T> {
  const byId = new Map(originals.map((experience) => [experience.id, experience]));
  let restored = 0;

  const experiences = proposed.map((proposal) => {
    const original = byId.get(proposal.id);
    if (!original) return proposal;
    if (proposal.achievements.length >= original.achievements.length) return proposal;

    restored += 1;
    return { ...proposal, achievements: [...original.achievements] };
  });

  return { experiences, restored };
}

/** Aviso para a pessoa entender por que aquele trecho não foi reescrito. */
export function restoredNote(restored: number): string {
  return restored === 1
    ? 'Em uma experiência, a IA devolveu menos resultados do que você informou. Os seus resultados originais foram mantidos, sem reescrita, para nenhum deles se perder.'
    : `Em ${restored} experiências, a IA devolveu menos resultados do que você informou. Os seus resultados originais foram mantidos, sem reescrita, para nenhum deles se perder.`;
}
