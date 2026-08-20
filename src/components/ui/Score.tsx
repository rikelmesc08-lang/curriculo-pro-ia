import { clamp, cx } from '@/lib/utils';

/**
 * Indicadores numéricos (compatibilidade e ATS).
 *
 * A faixa de cor é a mesma nos dois e vai de vermelho a verde. O que ela NÃO
 * faz é prometer resultado: o texto de ressalva vem sempre junto, colado ao
 * número, e não escondido no rodapé da página. Ver `MATCH_DISCLAIMER` e
 * `ATS_DISCLAIMER`.
 */

function toneFor(score: number): { stroke: string; text: string; label: string } {
  if (score >= 75) return { stroke: 'var(--color-success)', text: 'text-success', label: 'Boa aderência' };
  if (score >= 50) return { stroke: 'var(--color-warning)', text: 'text-warning', label: 'Aderência parcial' };
  return { stroke: 'var(--color-danger)', text: 'text-danger', label: 'Aderência baixa' };
}

export function ScoreRing({
  value,
  caption,
  size = 132,
  suffix = '%',
}: {
  value: number;
  caption?: string;
  size?: number;
  suffix?: string;
}) {
  const score = clamp(Math.round(value), 0, 100);
  const tone = toneFor(score);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;

  // O texto interno acompanha o diametro. Sem isto, um anel pequeno (a vitrine
  // do heroi usa 92px) mantinha a fonte do tamanho padrao e o rotulo
  // "Boa aderencia" transbordava para fora do circulo.
  const escala = size / 132;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="64" cy="64" r={radius} fill="none" stroke="var(--color-line)" strokeWidth="10" />
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke={tone.stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
          <span
            className={cx('font-bold tabular-nums leading-none', tone.text)}
            style={{ fontSize: `${30 * escala}px` }}
          >
            {score}
            <span style={{ fontSize: `${18 * escala}px` }}>{suffix}</span>
          </span>
          <span
            className="mt-0.5 font-medium leading-tight text-muted"
            style={{ fontSize: `${11 * escala}px` }}
          >
            {tone.label}
          </span>
        </div>
      </div>
      {caption && <p className="mt-2 text-sm font-medium text-ink-soft">{caption}</p>}
    </div>
  );
}

export function ScoreBar({ label, value, comment }: { label: string; value: number; comment?: string }) {
  const score = clamp(Math.round(value), 0, 100);
  const tone = toneFor(score);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink-soft">{label}</span>
        <span className={cx('text-sm font-bold tabular-nums', tone.text)}>{score}</span>
      </div>
      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line"
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${score}%`, backgroundColor: tone.stroke }} />
      </div>
      {comment && <p className="mt-1.5 text-xs leading-relaxed text-muted">{comment}</p>}
    </div>
  );
}
