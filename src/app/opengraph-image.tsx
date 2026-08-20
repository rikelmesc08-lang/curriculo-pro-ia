import { ImageResponse } from 'next/og';

/**
 * Imagem de compartilhamento (Open Graph e Twitter).
 *
 * GERADA POR CÓDIGO, não é um PNG no repositório. Três razões práticas:
 *
 *   1. os tokens de cor da marca vivem em um lugar só; um PNG exportado à mão
 *      sai de sincronia na primeira troca de paleta e ninguém percebe;
 *   2. o texto fica em texto de verdade — corrigir uma vírgula é editar este
 *      arquivo, não reabrir um editor de imagem;
 *   3. o repositório não carrega binário de 200KB que o git versiona inteiro a
 *      cada ajuste.
 *
 * O Next também usa esta imagem para a tag `twitter:image` quando não existe um
 * `twitter-image` próprio — que é o caso aqui, porque a arte é a mesma.
 */

export const alt =
  'CurrículoPro IA — crie, otimize e adapte seu currículo para vagas de emprego com inteligência artificial';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Os mesmos valores de `globals.css`. Satori não lê custom property de CSS, e é
// por isso que eles aparecem literais aqui.
const BRAND_600 = '#2559eb';
const BRAND_900 = '#1e358a';
const INK = '#0f172a';
const MUTED = '#64748b';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#ffffff',
          padding: '72px 80px',
          // A faixa da marca no topo; sem ela o cartão fica com cara de
          // documento em branco na timeline.
          borderTop: `20px solid ${BRAND_600}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <svg width="64" height="64" viewBox="0 0 32 32">
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
          <div style={{ display: 'flex', fontSize: 38, fontWeight: 700, color: INK }}>
            <span>Currículo</span>
            <span style={{ color: BRAND_600 }}>Pro</span>
            <span>&nbsp;IA</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 68,
              fontWeight: 700,
              color: INK,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            Seu currículo mais preparado para cada oportunidade.
          </div>
          <div style={{ display: 'flex', fontSize: 30, color: MUTED, lineHeight: 1.4 }}>
            Análise, correção e adaptação de currículo com inteligência artificial.
          </div>
        </div>

        {/*
          A promessa de integridade aparece no cartão de compartilhamento, e não
          só dentro do produto: é o que diferencia esta ferramenta das que
          escrevem experiência que a pessoa nunca teve.
        */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/*
            O certo é desenhado, não escrito. A fonte padrão do ImageResponse
            não traz o glifo "✓" (U+2713), e ele saía como quadrado vazio —
            defeito que só aparece na imagem gerada, nunca no código.
          */}
          <div
            style={{
              display: 'flex',
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: BRAND_600,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12.5l4.5 4.5L19 7"
                stroke="#ffffff"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: INK }}>
            A IA melhora o que você escreveu. Ela não inventa nada.
          </div>
        </div>
      </div>
    ),
    size
  );
}
