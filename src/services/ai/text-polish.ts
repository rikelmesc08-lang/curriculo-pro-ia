/**
 * Ajustes de texto do modo demonstração.
 *
 * O que estas funções fazem: pontuação, maiúscula, espaço duplicado, primeira
 * pessoa ("eu atendia" → "atendimento a"), e transformar linha em item de
 * lista. O que elas NÃO fazem, em nenhuma hipótese: acrescentar informação.
 * Se a entrada não tem número, a saída não tem número.
 *
 * Cada função devolve também a lista do que mudou, porque no modo demonstração
 * o usuário precisa enxergar que a mudança foi cosmética — e não confundir
 * isso com o trabalho do modelo real.
 */

const FILLERS = [
  'basicamente',
  'simplesmente',
  'literalmente',
  'meio que',
  'tipo assim',
  'um pouco de',
];

/** Colapsa espaço, corrige espaço antes de pontuação e garante ponto final. */
function tidy(value: string): string {
  const collapsed = value
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
  if (collapsed.length === 0) return '';
  return /[.!?]$/.test(collapsed) ? collapsed : `${collapsed}.`;
}

function capitalizeSentences(value: string): string {
  return value.replace(/(^|[.!?]\s+)([a-zà-ú])/g, (_match, prefix: string, letter: string) =>
    prefix + letter.toUpperCase()
  );
}

/** Remove o "eu" e conjuga para a forma impessoal usada em currículo. */
function removeFirstPerson(value: string): string {
  return value
    .replace(/\b[Ee]u\s+/g, '')
    .replace(/\b[Ff]iz\b/g, 'realizei')
    .replace(/^\s*[Tt]rabalhei\b/, 'Atuação');
}

export interface PolishResult {
  text: string;
  changes: string[];
}

export function polishParagraph(input: string): PolishResult {
  const original = input;
  const changes: string[] = [];

  let value = input;

  const withoutFillers = FILLERS.reduce(
    (accumulator, filler) => accumulator.replace(new RegExp(`\\b${filler}\\b\\s*`, 'gi'), ''),
    value
  );
  if (withoutFillers !== value) changes.push('Removidas expressões de preenchimento.');
  value = withoutFillers;

  const impersonal = removeFirstPerson(value);
  if (impersonal !== value) changes.push('Texto passado para a forma impessoal, padrão em currículo.');
  value = impersonal;

  const tidied = capitalizeSentences(tidy(value));
  if (tidied !== value) changes.push('Ajustes de pontuação, espaçamento e maiúsculas.');
  value = tidied;

  if (value === tidy(original) && changes.length === 0) {
    changes.push('Nenhum ajuste necessário: o texto já estava bem formatado.');
  }

  return { text: value, changes };
}

/**
 * Quebra uma descrição corrida em itens.
 *
 * Divide por linha; se vier tudo numa linha só, divide por ponto e vírgula ou
 * por " e " entre orações longas. Não cria item que não estava no texto.
 */
export function toBullets(input: string): string[] {
  const byLine = input
    .split('\n')
    .map((line) => line.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean);

  if (byLine.length > 1) return byLine.map((line) => capitalizeSentences(tidy(line)));

  const single = byLine[0] ?? '';
  if (!single) return [];

  const parts = single
    .split(/;|\.\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 8);

  if (parts.length <= 1) return [capitalizeSentences(tidy(single))];
  return parts.map((part) => capitalizeSentences(tidy(part)));
}
