import { ImageResponse } from 'next/og';

/**
 * Ícone para "adicionar à tela de início" no iOS.
 *
 * Precisa ser PNG — o Safari ignora SVG aqui, ao contrário do favicon da aba —
 * e por isso é gerado por código em vez de ser mais um binário no repositório.
 *
 * O FUNDO É SÓLIDO de propósito: o iOS não respeita transparência neste ícone,
 * preenche com preto, e o desenho azul escuro sobre preto some.
 */

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

const BRAND_600 = '#2559eb';
const BRAND_900 = '#1e358a';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
        }}
      >
        <svg width="132" height="132" viewBox="0 0 32 32">
          <rect x="2" y="1" width="22" height="30" rx="4.5" fill={BRAND_600} />
          <path d="M7 9h12M7 14.5h12M7 20h6" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="23" cy="22" r="8.5" fill={BRAND_900} />
          <path
            d="M19.5 22.5l2.6 2.6 4.4-5.4"
            stroke="#ffffff"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
    ),
    size
  );
}
