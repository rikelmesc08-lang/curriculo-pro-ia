'use client';

import { useRef, type ReactNode } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useIsCompactScreen, usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { cx } from '@/lib/utils';

/**
 * Card que se endireita conforme a página rola.
 *
 * Adaptado do "Container Scroll Animation" do 21st.dev. O que mudou em
 * relação ao original, e por quê:
 *
 * 1. ESPAÇAMENTO. O exemplo vinha com `pt-[1000px] pb-[500px]` e altura de
 *    `80rem`. Numa landing isso empurra a proposta e os botões para muito
 *    abaixo da dobra — é o oposto do que uma página de conversão precisa.
 *    Aqui o card começa visível e a animação acontece nos primeiros pixels de
 *    rolagem.
 *
 * 2. PALETA. O original é escuro (`#222222`, `#6C6C6C`, sombra preta densa) e
 *    destoaria de um produto de fundo claro. A moldura virou branca com borda
 *    fina, e a sombra ganhou tom azulado da marca em vez de preto puro.
 *
 * 3. MOVIMENTO MAIS CONTIDO. A rotação caiu de 20° para 14° (8° no celular) e
 *    a escala do celular deixou de ir a 0.7 — naquele tamanho o conteúdo do
 *    card ficava ilegível justamente em quem mais precisa lê-lo.
 *
 * 4. `prefers-reduced-motion`. O original ignora a preferência. Aqui, quem
 *    pediu menos movimento recebe o card parado e reto, com todo o conteúdo.
 *
 * 5. O TEXTO E OS BOTÕES NÃO SE MEXEM. O original também desloca o cabeçalho
 *    durante a rolagem. Mover um botão de "criar meu currículo" debaixo do
 *    cursor de alguém é risco de conversão sem retorno visual proporcional —
 *    o efeito premium vem do card, e a chamada para ação fica firme.
 */
export function ScrollRevealCard({
  children,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  /** Descreve o conteúdo do card para leitores de tela. */
  ariaLabel: string;
}) {
  const referencia = useRef<HTMLDivElement>(null);
  const reduzirMovimento = usePrefersReducedMotion();
  const telaEstreita = useIsCompactScreen();

  // `offset` explícito, e nao o padrao da biblioteca. O padrao
  // (`start start`) so comeca a contar quando o topo do card encosta no topo
  // da janela -- e como o card fica ABAIXO do texto, ele ficaria torto durante
  // a primeira tela inteira e so se endireitaria depois que a pessoa ja tivesse
  // passado do heroi. Aqui o progresso corre entre "o topo do card entrou pela
  // base da janela" e "o centro do card chegou ao centro da janela": no
  // carregamento ele ja aparece parcialmente inclinado, e um empurrao curto de
  // rolagem termina o movimento.
  const { scrollYProgress } = useScroll({
    target: referencia,
    offset: ['start end', 'center center'],
  });

  const rotacaoInicial = reduzirMovimento ? 0 : telaEstreita ? 8 : 14;
  const escalaInicial = reduzirMovimento ? 1 : telaEstreita ? 0.94 : 1.04;

  const rotateX = useTransform(scrollYProgress, [0, 1], [rotacaoInicial, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [escalaInicial, 1]);

  return (
    <div ref={referencia} className={cx('relative', className)}>
      <div style={{ perspective: '1200px' }}>
        <motion.div
          style={{ rotateX, scale }}
          // A sombra é estática, não animada: animar `box-shadow` força
          // repintura a cada quadro, enquanto `transform` fica na GPU.
          className="mx-auto w-full rounded-2xl border border-line bg-surface p-1.5 shadow-showcase sm:p-2.5"
        >
          <div
            role="img"
            aria-label={ariaLabel}
            className="overflow-hidden rounded-xl border border-line bg-canvas"
          >
            {children}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
