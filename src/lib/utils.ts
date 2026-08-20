/**
 * Utilitários sem dependência de framework. Podem ser importados do cliente e
 * do servidor — não coloque nada que leia `process.env` aqui.
 */

/** Junta classes ignorando `false`, `null` e `undefined`. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Id curto e estável para itens de lista no formulário. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Iniciais do nome, para o avatar. Só a primeira e a última palavra. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Primeiro nome — usado no "Olá, [nome]!". */
export function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first || '';
}

/** Quebra um texto multilinha em itens, descartando linhas vazias e marcadores. */
export function linesToList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.replace(/^\s*[-•*]\s*/, '').trim())
    .filter((line) => line.length > 0);
}

export function listToLines(items: string[]): string {
  return items.join('\n');
}

/** Data ISO → `19/08/2026`. Devolve string vazia para entrada inválida. */
export function formatDate(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(date);
}

/** `2022-03` ou `03/2022` → `03/2022`. Mantém o texto original se não reconhecer. */
export function formatPeriod(value: string): string {
  if (!value) return '';
  const iso = /^(\d{4})-(\d{2})$/.exec(value);
  if (iso) return `${iso[2]}/${iso[1]}`;
  return value;
}

/** Junta início e fim num período legível, respeitando "atual". */
export function periodLabel(start: string, end: string, current: boolean): string {
  const from = formatPeriod(start);
  const to = current ? 'Atual' : formatPeriod(end);
  if (!from && !to) return '';
  if (!from) return to;
  if (!to) return from;
  return `${from} — ${to}`;
}

/** Limita um número ao intervalo fechado. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Plural simples: `pluralize(1,'vaga','vagas')`. */
export function pluralize(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** Normaliza para comparação: minúsculas, sem acento, sem pontuação. */
export function normalizeForCompare(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
