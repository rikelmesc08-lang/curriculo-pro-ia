import { EXAMPLE_ANALYSIS, EXAMPLE_RESUME } from '@/lib/resume/example';
import { MATCH_DISCLAIMER } from '@/types/ai';
import { Badge } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { ScoreRing } from '@/components/ui/Score';
import { ResumeSheet } from '@/components/resume/ResumeSheet';

/**
 * O que aparece dentro do card em perspectiva: o produto de verdade.
 *
 * A folha da esquerda é renderizada pelo MESMO `ResumeSheet` que a
 * pré-visualização do construtor e o gerador de PDF usam. Não é captura de
 * tela nem maquete: se um modelo mudar, a vitrine muda junto — e nunca vai
 * mostrar uma interface que o produto não tem.
 *
 * O selo "Exemplo ilustrativo" fica sempre visível, nos dois tamanhos de tela.
 * Um currículo com nome e telefone numa landing é lido como pessoa real se
 * ninguém disser o contrário.
 */
export function HeroShowcase() {
  return (
    // NO CELULAR A ALTURA E AUTOMATICA, de proposito. Com altura fixa, a
    // ressalva de compatibilidade ficava cortada por 40px -- e ela e
    // justamente o que impede o "78%" de ser lido como promessa de
    // contratacao. Do `sm` para cima a altura volta a ser fixa, para o card em
    // perspectiva manter uma proporcao estavel enquanto gira.
    <div className="flex flex-col sm:h-[25rem] lg:h-[28rem]">
      {/* Barra superior, imitando o topo da ferramenta */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name="alvo" className="h-4 w-4 shrink-0 text-brand-600" />
          <span className="truncate text-xs font-semibold text-ink">Analisar vaga</span>
        </div>
        <Badge tone="neutral" className="shrink-0 text-[10px]">
          Exemplo ilustrativo
        </Badge>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
        {/*
          A folha do currículo. Escondida abaixo de `lg` porque, dentro de um
          card de 350px, ela viraria um borrão cinza — e um borrão não comunica
          nada. No celular a coluna de análise ocupa a largura toda e mostra o
          que de fato interessa ali.
        */}
        <div className="relative hidden min-h-0 overflow-hidden bg-canvas p-4 lg:block">
          <div className="origin-top scale-[0.82]">
            <ResumeSheet resume={EXAMPLE_RESUME} scale={0.9} />
          </div>
          {/* Esmaece o rodapé da folha em vez de cortá-la em seco. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-canvas to-transparent" />
        </div>

        {/* Coluna de análise */}
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden border-line bg-surface p-4 lg:border-l">
          <div className="flex items-center gap-4">
            <ScoreRing value={EXAMPLE_ANALYSIS.compatibilidade} size={92} />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Compatibilidade
              </p>
              <p className="mt-0.5 text-sm leading-snug text-ink-soft">
                Comparação entre o currículo e a descrição da vaga.
              </p>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Termos da vaga encontrados
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {EXAMPLE_ANALYSIS.encontrados.map((termo) => (
                <li
                  key={termo}
                  className="rounded-full border border-success/20 bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success"
                >
                  {termo}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-line bg-canvas p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Lacuna apontada
            </p>
            <p className="mt-0.5 text-sm font-semibold text-ink">{EXAMPLE_ANALYSIS.lacuna}</p>
            <p className="mt-1 text-xs leading-relaxed text-brand-800">{EXAMPLE_ANALYSIS.sugestao}</p>
          </div>

          <p className="mt-auto text-[10px] leading-relaxed text-muted">{MATCH_DISCLAIMER}</p>
        </div>
      </div>
    </div>
  );
}
