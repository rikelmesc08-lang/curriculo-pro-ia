import { ButtonLink } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { FlowSteps } from './FlowSteps';
import { HeroShowcase } from './HeroShowcase';
import { ScrollRevealCard } from './ScrollRevealCard';

const FLOW = [
  { title: 'Currículo original', detail: 'Você escreve ou cola o que já tem. Nada é alterado sem você ver.' },
  { title: 'Análise da vaga', detail: 'Cole a descrição da vaga. Extraímos cargo, competências e palavras-chave.' },
  { title: 'Otimização com IA', detail: 'A IA reescreve seus textos com foco na vaga — usando só os seus fatos.', highlight: true },
  { title: 'Currículo personalizado', detail: 'Você revisa, escolhe o modelo e baixa em PDF.' },
];

const GARANTIAS = ['Modelos legíveis por ATS', 'Download em PDF', 'A IA não inventa experiência'];

/**
 * Herói da landing page.
 *
 * ESTE COMPONENTE CONTINUA SENDO DE SERVIDOR, e isso é de propósito. Só o
 * `ScrollRevealCard` carrega `"use client"`; o conteúdo do card é passado como
 * `children` e renderiza no servidor. Resultado prático: o `ResumeSheet`, os
 * modelos e o currículo de exemplo NÃO entram no pacote que o navegador baixa,
 * mesmo aparecendo dentro de um componente animado.
 *
 * O texto e os botões ficam acima do card e não se movem durante a rolagem —
 * ver a nota em `ScrollRevealCard` sobre por que a animação não toca na
 * chamada para ação.
 */
export function Hero({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <section className="overflow-hidden border-b border-line bg-surface">
      <div className="container-page py-12 md:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <Badge tone="info">Seu currículo mais preparado para cada oportunidade</Badge>

          <h1 className="mt-4 text-3xl font-bold leading-tight text-ink sm:text-4xl lg:text-[2.9rem]">
            Seu currículo pode estar te impedindo de conseguir entrevistas.
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-ink-soft sm:text-lg">
            Use inteligência artificial para transformar suas experiências em um currículo
            profissional, claro e adaptado à vaga que você deseja.
          </p>

          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink
              href={isAuthenticated ? '/app/curriculo' : '/cadastro'}
              size="lg"
              className="uppercase tracking-wide"
            >
              Criar meu currículo
            </ButtonLink>
            <ButtonLink
              // /app/analise e não /app/analisar-vaga: o botão diz "analisar meu
              // currículo", e analisar-vaga é outra ferramenta — aquela lê o anúncio
              // da empresa. Quem clica aqui quer o diagnóstico do próprio currículo.
              href={isAuthenticated ? '/app/analise' : '/cadastro?destino=analisar'}
              size="lg"
              variant="secondary"
              className="uppercase tracking-wide"
            >
              Analisar meu currículo
            </ButtonLink>
          </div>

          <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted">
            {GARANTIAS.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Icon name="check" className="h-4 w-4 text-success" strokeWidth={2.2} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <ScrollRevealCard
          className="mx-auto mt-10 max-w-5xl md:mt-14"
          ariaLabel="Exemplo ilustrativo da ferramenta: um currículo ao lado da análise de compatibilidade com uma vaga, mostrando 78% de aderência, os termos encontrados e uma lacuna apontada."
        >
          <HeroShowcase />
        </ScrollRevealCard>

        <div className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Como o sistema trabalha
          </h2>
          <FlowSteps steps={FLOW} className="mt-4" />
        </div>
      </div>
    </section>
  );
}
