import { cx } from '@/lib/utils';

/**
 * Conjunto de ícones do produto, desenhados à mão em SVG.
 *
 * Sem biblioteca de ícones: são doze traçados, e uma dependência inteira para
 * isso acrescentaria peso ao pacote que o usuário baixa sem acrescentar nada
 * que estes doze não resolvam. Todos herdam `currentColor` e usam o mesmo
 * `stroke-width`, para não haver desalinhamento visual entre eles.
 */

export type IconName =
  | 'documento'
  | 'alvo'
  | 'chave'
  | 'carta'
  | 'conversa'
  | 'download'
  | 'brilho'
  | 'check'
  | 'seta-direita'
  | 'seta-baixo'
  | 'painel'
  | 'lista'
  | 'engrenagem'
  | 'sair'
  | 'mais'
  | 'lixeira'
  | 'olho'
  | 'aviso';

const PATHS: Record<IconName, React.ReactNode> = {
  documento: (
    <>
      <path d="M14 3v5h5" />
      <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5Z" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  alvo: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  chave: (
    <>
      <circle cx="8" cy="14" r="4" />
      <path d="M11 11 20 2M17 5l2 2M15 7l2 2" />
    </>
  ),
  carta: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  conversa: (
    <>
      <path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-4.5A7 7 0 0 1 8 5h5a7 7 0 0 1 7 7Z" />
      <path d="M9 11h6M9 14h4" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10" />
      <path d="m8 11 4 4 4-4" />
      <path d="M5 19h14" />
    </>
  ),
  brilho: (
    <>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="M12 8.5 13.4 11l2.6 1-2.6 1-1.4 2.5L10.6 13 8 12l2.6-1L12 8.5Z" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  'seta-direita': (
    <>
      <path d="M4 12h15" />
      <path d="m14 7 5 5-5 5" />
    </>
  ),
  'seta-baixo': (
    <>
      <path d="M12 4v15" />
      <path d="m7 14 5 5 5-5" />
    </>
  ),
  painel: (
    <>
      <rect x="3" y="3" width="7" height="8" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="11" width="7" height="10" rx="1.5" />
    </>
  ),
  lista: (
    <>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  ),
  engrenagem: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
    </>
  ),
  sair: (
    <>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M16 16l4-4-4-4M20 12H9" />
    </>
  ),
  mais: <path d="M12 5v14M5 12h14" />,
  lixeira: (
    <>
      <path d="M4 7h16M10 4h4M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  olho: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  aviso: (
    <>
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
};

export function Icon({
  name,
  className,
  strokeWidth = 1.7,
}: {
  name: IconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx('h-5 w-5 shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
